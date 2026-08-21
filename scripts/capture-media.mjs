/**
 * Capture README stills, GIFs, and example MP4s.
 * Needs `npm run dev`, Google Chrome, and ffmpeg.
 *
 *   npm run media              # stills + GIFs
 *   npm run media:video        # MP4s (skips webcam; audio muxed when needed)
 *   MEDIA=all npm run media    # both
 *   CAPTURE=field,audio npm run media:video
 */
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const OUT = join(ROOT, "docs", "media");
const AUDIO = join(ROOT, "public", "audio", "Terminal_Hours.mp3");
const BASE = "http://127.0.0.1:5173";
const PORT = 9333;
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome";
const GIF_FPS = 10;
const VIDEO_FPS = 15;
const MODE = process.env.MEDIA ?? "gif";
const WANT_GIF = MODE === "gif" || MODE === "all";
const WANT_VIDEO = MODE === "video" || MODE === "all";

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

async function waitForCanvas(cdp, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await cdp.evaluate(`(() => {
      const c = document.querySelector("canvas");
      return Boolean(c && c.width >= 8 && c.height >= 8);
    })()`);
    if (ready) return;
    await sleep(120);
  }
  throw new Error("canvas never appeared");
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

/**
 * @returns {Promise<{ file: string, t: number }[]>}
 */
async function recordJpeg(cdp, dir, seconds, onTick, fps) {
  await mkdir(dir, { recursive: true });
  /** @type {{ file: string, t: number }[]} */
  const stamps = [];
  const tStart = Date.now();
  const interval = 1000 / fps;
  let i = 0;
  while (true) {
    const shotStart = Date.now();
    const t = (shotStart - tStart) / 1000;
    if (i > 0 && t >= seconds) break;
    if (onTick) await onTick(t);
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 86,
      fromSurface: true,
    });
    const file = `f${String(i).padStart(4, "0")}.jpg`;
    await writeFile(join(dir, file), Buffer.from(data, "base64"));
    stamps.push({ file, t: (shotStart - tStart) / 1000 });
    i++;
    const wait = interval - (Date.now() - shotStart);
    if (wait > 0) await sleep(wait);
    if (Date.now() - tStart >= seconds * 1000) break;
  }
  return stamps;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
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

function ffmpegGif(framesDir, outPath, scale) {
  const vf =
    `fps=${GIF_FPS},scale=${scale}:-1:flags=lanczos,split[s0][s1];` +
    `[s0]palettegen=max_colors=48:stats_mode=diff[p];` +
    `[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  return runFfmpeg(["-y", "-framerate", String(GIF_FPS), "-i", join(framesDir, "f%04d.jpg"), "-vf", vf, outPath]);
}

function concatPath(path) {
  return path.replaceAll("'", "'\\''");
}

async function ffmpegMp4(framesDir, stamps, outPath, { audio, duration }) {
  if (stamps.length === 0) throw new Error("no frames to encode");
  const listPath = join(framesDir, "concat.txt");
  const lines = [];
  for (let i = 0; i < stamps.length; i++) {
    const nextT = i + 1 < stamps.length ? stamps[i + 1].t : duration;
    const d = Math.max(0.001, nextT - stamps[i].t);
    lines.push(`file '${concatPath(join(framesDir, stamps[i].file))}'`);
    lines.push(`duration ${d.toFixed(4)}`);
  }
  lines.push(`file '${concatPath(join(framesDir, stamps[stamps.length - 1].file))}'`);
  await writeFile(listPath, `${lines.join("\n")}\n`);

  /** @type {string[]} */
  const args = ["-y", "-f", "concat", "-safe", "0", "-i", listPath];
  if (audio) args.push("-i", audio);
  args.push(
    "-t",
    String(duration),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "18",
    "-movflags",
    "+faststart",
  );
  if (audio) args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
  args.push(outPath);
  await runFfmpeg(args);
}

async function hideUi(cdp) {
  await cdp.evaluate(`{
    for (const sel of [".caption", ".transport"]) {
      const el = document.querySelector(sel);
      if (el) el.style.display = "none";
    }
  }`);
}

async function clickCanvas(cdp) {
  await cdp.evaluate(`document.querySelector("canvas")?.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    view: window,
  }))`);
}

async function clickStart(cdp) {
  const rect = await cdp.evaluate(`(() => {
    const el = document.querySelector(".start");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!rect) throw new Error("no start button");
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: rect.x,
    y: rect.y,
    button: "left",
    clickCount: 1,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: rect.x,
    y: rect.y,
    button: "left",
    clickCount: 1,
  });
  const started = await cdp.evaluate(`(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      const btn = document.querySelector(".start");
      if (btn?.hidden) return true;
      await new Promise((r) => setTimeout(r, 40));
    }
    return false;
  })()`);
  if (!started) throw new Error("audio example did not start");
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
      "--autoplay-policy=no-user-gesture-required",
      "--window-size=1280,800",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    await waitFor(`http://127.0.0.1:${PORT}/json/version`);
    const { cdp, ws } = await connectPage();

    const filter = (process.env.CAPTURE ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (WANT_GIF && (filter.length === 0 || filter.includes("workbench"))) {
      await setViewport(cdp, 1280, 800);
      await goto(cdp, `${BASE}/`);
      await waitForInk(cdp);
      await sleep(400);
      const workbenchPng = join(OUT, "workbench.png");
      await screenshotPng(cdp, workbenchPng);
      console.log("wrote", workbenchPng);
    }

    /** @type {Array<{
      name: string,
      url: string,
      seconds: number,
      width: number,
      height: number,
      videoWidth?: number,
      videoHeight?: number,
      scale: number,
      still?: boolean,
      gif?: boolean,
      video?: boolean,
      clickStart?: boolean,
      audio?: string,
      onTick?: (t: number) => Promise<void>,
    }>} */
    const examples = [
      {
        name: "field",
        url: `${BASE}/examples/field.html`,
        seconds: 3.6,
        width: 800,
        height: 300,
        scale: 560,
        still: true,
        gif: true,
        video: true,
        onTick: (() => {
          const hits = new Set();
          return async (t) => {
            for (const at of [0.9, 2.4]) {
              if (!hits.has(at) && t >= at) {
                hits.add(at);
                await clickCanvas(cdp);
              }
            }
          };
        })(),
      },
      {
        name: "morph",
        url: `${BASE}/examples/morph.html`,
        seconds: 6.2,
        width: 800,
        height: 300,
        scale: 560,
        gif: true,
        video: true,
      },
      {
        name: "dissolve",
        url: `${BASE}/examples/in-between.html`,
        seconds: 7.4,
        width: 800,
        height: 300,
        scale: 560,
        gif: true,
        video: false,
      },
      {
        name: "in-between",
        url: `${BASE}/examples/in-between.html`,
        seconds: 7.4,
        width: 800,
        height: 300,
        scale: 560,
        gif: false,
        video: true,
      },
      {
        name: "attract",
        url: `${BASE}/examples/attract.html`,
        seconds: 7.6,
        width: 800,
        height: 300,
        scale: 560,
        gif: true,
        video: true,
      },
      {
        name: "wind",
        url: `${BASE}/examples/wind.html`,
        seconds: 6.8,
        width: 800,
        height: 300,
        scale: 560,
        gif: true,
        video: true,
      },
      {
        name: "vortex",
        url: `${BASE}/examples/vortex.html`,
        seconds: 7.6,
        width: 800,
        height: 300,
        scale: 560,
        gif: true,
        video: true,
      },
      {
        name: "sequence",
        url: `${BASE}/examples/sequence.html`,
        seconds: 7.2,
        width: 800,
        height: 300,
        scale: 560,
        gif: false,
        video: true,
      },
      {
        name: "collide",
        url: `${BASE}/examples/collide.html`,
        seconds: 12,
        width: 1100,
        height: 520,
        scale: 720,
        gif: true,
        video: true,
      },
      {
        name: "image",
        url: `${BASE}/examples/image.html`,
        seconds: 12.5,
        width: 800,
        height: 300,
        scale: 560,
        gif: true,
        video: true,
      },
      {
        name: "audio",
        url: `${BASE}/examples/audio.html`,
        seconds: 16,
        width: 800,
        height: 300,
        videoWidth: 1280,
        videoHeight: 480,
        scale: 560,
        gif: false,
        video: true,
        clickStart: true,
        audio: AUDIO,
      },
      {
        name: "audio-bands",
        url: `${BASE}/examples/audio-bands.html`,
        seconds: 16,
        width: 800,
        height: 300,
        videoWidth: 1280,
        videoHeight: 480,
        scale: 560,
        gif: false,
        video: true,
        clickStart: true,
        audio: AUDIO,
      },
      {
        name: "audio-beats",
        url: `${BASE}/examples/audio-beats.html`,
        seconds: 16,
        width: 800,
        height: 300,
        videoWidth: 1280,
        videoHeight: 480,
        scale: 560,
        gif: false,
        video: true,
        clickStart: true,
        audio: AUDIO,
      },
    ];

    const jobs = examples.filter((job) => {
      if (filter.length && !filter.includes(job.name)) return false;
      if (WANT_GIF && job.gif) return true;
      if (WANT_VIDEO && job.video) return true;
      return false;
    });
    if (filter.length && jobs.length === 0 && !(WANT_GIF && filter.includes("workbench"))) {
      throw new Error(`CAPTURE=${filter.join(",")} matched no examples`);
    }

    for (const job of jobs) {
      const doGif = WANT_GIF && job.gif;
      const doVideo = WANT_VIDEO && job.video;
      const width = doVideo ? (job.videoWidth ?? 1280) : job.width;
      const height = doVideo ? (job.videoHeight ?? 480) : job.height;
      await setViewport(cdp, width, height);
      await goto(cdp, job.url);
      if (job.clickStart) {
        await waitForCanvas(cdp);
        await clickStart(cdp);
      }
      await waitForInk(cdp);
      await hideUi(cdp);
      await sleep(job.clickStart ? 80 : 250);
      if (doGif && job.still) {
        const png = join(OUT, `${job.name}.png`);
        await screenshotPng(cdp, png);
        console.log("wrote", png);
      }
      const frames = join(tmpdir(), `glyph-matter-frames-${job.name}-${process.pid}`);
      await rm(frames, { recursive: true, force: true });
      if (doGif && !doVideo) {
        await recordJpeg(cdp, frames, job.seconds, job.onTick, GIF_FPS);
        const gif = join(OUT, `${job.name}.gif`);
        await ffmpegGif(frames, gif, job.scale);
        console.log("wrote", gif);
      } else if (doVideo && !doGif) {
        const stamps = await recordJpeg(cdp, frames, job.seconds, job.onTick, VIDEO_FPS);
        const mp4 = join(OUT, `${job.name}.mp4`);
        await ffmpegMp4(frames, stamps, mp4, { audio: job.audio, duration: job.seconds });
        console.log("wrote", mp4);
      } else {
        const stamps = await recordJpeg(cdp, frames, job.seconds, job.onTick, VIDEO_FPS);
        const mp4 = join(OUT, `${job.name}.mp4`);
        await ffmpegMp4(frames, stamps, mp4, { audio: job.audio, duration: job.seconds });
        console.log("wrote", mp4);
        const gif = join(OUT, `${job.name}.gif`);
        await ffmpegGif(frames, gif, job.scale);
        console.log("wrote", gif);
      }
      await rm(frames, { recursive: true, force: true });
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
