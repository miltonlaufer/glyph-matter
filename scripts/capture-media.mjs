/**
 * Capture README stills and GIFs. Needs `npm run dev`, Google Chrome, and ffmpeg.
 *
 *   node scripts/capture-media.mjs
 */
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const OUT = join(ROOT, "docs", "media");
const BASE = "http://127.0.0.1:5173";
const PORT = 9333;
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome";
const FPS = 10;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      /* retry */
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${url}`);
}

class Cdp {
  /** @param {WebSocket} ws */
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id != null) {
        const job = this.pending.get(msg.id);
        if (!job) return;
        this.pending.delete(msg.id);
        if (msg.error) job.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
        else job.resolve(msg.result);
        return;
      }
      const fn = this.handlers.get(msg.method);
      if (fn) fn(msg.params);
    });
  }

  on(method, fn) {
    this.handlers.set(method, fn);
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? "evaluate failed");
    }
    return result.result?.value;
  }
}

async function connectPage() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("no Chrome page target");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("CDP websocket failed")), {
      once: true,
    });
  });
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  return { cdp, ws };
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function goto(cdp, url) {
  const loaded = new Promise((resolve) => cdp.on("Page.loadEventFired", resolve));
  await cdp.send("Page.navigate", { url });
  await Promise.race([loaded, sleep(8000)]);
}

async function waitForInk(cdp, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await cdp.evaluate(`(() => {
      const c = document.querySelector("canvas");
      if (!c || c.width < 8 || c.height < 8) return false;
      const ctx = c.getContext("2d");
      if (!ctx) return false;
      const w = Math.min(c.width, 240);
      const h = Math.min(c.height, 240);
      const data = ctx.getImageData((c.width - w) / 2, (c.height - h) / 2, w, h).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 12) return true;
      return false;
    })()`);
    if (ready) return;
    await sleep(120);
  }
  throw new Error("canvas never showed ink");
}

async function screenshotPng(cdp, path) {
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await writeFile(path, Buffer.from(data, "base64"));
}

async function recordJpeg(cdp, dir, seconds, onTick) {
  await mkdir(dir, { recursive: true });
  const frames = Math.round(seconds * FPS);
  const interval = 1000 / FPS;
  for (let i = 0; i < frames; i++) {
    const t0 = Date.now();
    if (onTick) await onTick(i / FPS);
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 82,
      fromSurface: true,
    });
    await writeFile(join(dir, `f${String(i).padStart(4, "0")}.jpg`), Buffer.from(data, "base64"));
    const wait = interval - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
  }
}

function ffmpegGif(framesDir, outPath, scale) {
  return new Promise((resolve, reject) => {
    const vf =
      `fps=${FPS},scale=${scale}:-1:flags=lanczos,split[s0][s1];` +
      `[s0]palettegen=max_colors=48:stats_mode=diff[p];` +
      `[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
    const child = spawn(
      "ffmpeg",
      ["-y", "-framerate", String(FPS), "-i", join(framesDir, "f%04d.jpg"), "-vf", vf, outPath],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let err = "";
    child.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${err.slice(-800)}`));
    });
  });
}

async function clickCanvas(cdp) {
  await cdp.evaluate(`document.querySelector("canvas")?.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    view: window,
  }))`);
}

async function main() {
  await waitFor(`${BASE}/`);
  await mkdir(OUT, { recursive: true });
  const profile = join(tmpdir(), `glyph-matter-chrome-${process.pid}`);
  await rm(profile, { recursive: true, force: true });
  await mkdir(profile, { recursive: true });

  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1280,800",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    await waitFor(`http://127.0.0.1:${PORT}/json/version`);
    const { cdp, ws } = await connectPage();

    await setViewport(cdp, 1280, 800);
    await goto(cdp, `${BASE}/`);
    await waitForInk(cdp);
    await sleep(400);
    const workbenchPng = join(OUT, "workbench.png");
    await screenshotPng(cdp, workbenchPng);
    console.log("wrote", workbenchPng);

    const examples = [
      {
        name: "field",
        url: `${BASE}/examples/field.html`,
        seconds: 3.6,
        width: 800,
        height: 300,
        scale: 560,
        still: true,
        onTick: async (t) => {
          if (Math.abs(t - 0.9) < 0.05 || Math.abs(t - 2.4) < 0.05) await clickCanvas(cdp);
        },
      },
      {
        name: "morph",
        url: `${BASE}/examples/morph.html`,
        seconds: 6.2,
        width: 800,
        height: 300,
        scale: 560,
      },
      {
        name: "dissolve",
        url: `${BASE}/examples/in-between.html`,
        seconds: 7.4,
        width: 800,
        height: 300,
        scale: 560,
      },
    ];

    for (const job of examples) {
      await setViewport(cdp, job.width, job.height);
      await goto(cdp, job.url);
      await waitForInk(cdp);
      await cdp.evaluate(`{
        const cap = document.querySelector(".caption");
        if (cap) cap.style.display = "none";
      }`);
      await sleep(250);
      if (job.still) {
        const png = join(OUT, `${job.name}.png`);
        await screenshotPng(cdp, png);
        console.log("wrote", png);
      }
      const frames = join(tmpdir(), `glyph-matter-frames-${job.name}-${process.pid}`);
      await rm(frames, { recursive: true, force: true });
      await recordJpeg(cdp, frames, job.seconds, job.onTick);
      const gif = join(OUT, `${job.name}.gif`);
      await ffmpegGif(frames, gif, job.scale);
      await rm(frames, { recursive: true, force: true });
      console.log("wrote", gif);
    }

    ws.close();
  } finally {
    chrome.kill("SIGTERM");
    await sleep(300);
    await rm(profile, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
