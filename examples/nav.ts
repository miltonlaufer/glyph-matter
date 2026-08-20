/** Same header on every sketch and the workbench. */
const FILES = [
  { file: "field.html", label: "field" },
  { file: "morph.html", label: "morph" },
  { file: "in-between.html", label: "in-between" },
  { file: "attract.html", label: "attract" },
  { file: "wind.html", label: "wind" },
  { file: "vortex.html", label: "vortex" },
  { file: "sequence.html", label: "sequence" },
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

  if (!nav.isConnected) document.body.prepend(nav);
}
