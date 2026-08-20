/** Same header on every sketch and the workbench. */
const FILES = [
  { file: "field.html", label: "field" },
  { file: "morph.html", label: "morph" },
  { file: "in-between.html", label: "in-between" },
  { file: "attract.html", label: "attract" },
  { file: "wind.html", label: "wind" },
  { file: "vortex.html", label: "vortex" },
  { file: "sequence.html", label: "sequence" },
  { file: "image.html", label: "image" },
  { file: "webcam.html", label: "webcam" },
  { file: "audio.html", label: "audio" },
  { file: "audio-bands.html", label: "audio-bands" },
  { file: "audio-beats.html", label: "audio-beats" },
] as const;

function isDevRoot(): boolean {
  return import.meta.env.BASE_URL === "/";
}

function workbenchHref(): string {
  return isDevRoot() ? "/" : `${import.meta.env.BASE_URL}index.html`;
}

function exampleHref(file: string): string {
  return isDevRoot() ? `/examples/${file}` : `${import.meta.env.BASE_URL}${file}`;
}

function isCurrent(file: string | "workbench", path: string): boolean {
  if (file === "workbench") {
    return (
      path === "/" ||
      path === "/index.html" ||
      /\/glyph-matter-examples\/?(index\.html)?$/.test(path)
    );
  }
  if (path.endsWith(`/${file}`) || path.endsWith(file)) return true;
  return file === "field.html" && /\/examples\/?(index\.html)?$/.test(path);
}

export function mountSiteNav(): void {
  const nav = document.querySelector(".caption") ?? document.createElement("nav");
  nav.classList.add("caption");
  nav.setAttribute("aria-label", "Examples");
  nav.replaceChildren();

  const path = window.location.pathname;
  const pages: { href: string; file: string | "workbench"; label: string }[] = [
    { href: workbenchHref(), file: "workbench", label: "workbench" },
    ...FILES.map((page) => ({
      href: exampleHref(page.file),
      file: page.file,
      label: page.label,
    })),
  ];

  for (const [i, page] of pages.entries()) {
    if (i > 0) nav.append(" · ");
    if (isCurrent(page.file, path)) {
      const here = document.createElement("span");
      here.setAttribute("aria-current", "page");
      here.textContent = page.label;
      nav.append(here);
    } else {
      const link = document.createElement("a");
      link.href = page.href;
      link.textContent = page.label;
      nav.append(link);
    }
  }

  nav.append(" · ");
  nav.append(githubLink());

  if (!nav.isConnected) document.body.prepend(nav);
}

const REPO_URL = "https://github.com/miltonlaufer/glyph-matter";

function githubLink(): HTMLAnchorElement {
  const a = document.createElement("a");
  a.className = "caption-github";
  a.href = REPO_URL;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.setAttribute("aria-label", "glyph-matter on GitHub");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8",
  );
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  a.append(svg);
  return a;
}
