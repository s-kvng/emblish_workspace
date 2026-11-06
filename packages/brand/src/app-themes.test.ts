import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Each app's theme maps its component library onto the one brand token set (#24).
const themes = {
  "Storefront (shadcn)": "../../ui/src/styles/globals.css",
  "Back Office (HeroUI Native)": "../../../apps/native/global.css",
};

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const declaration = (css: string, name: string) =>
  css.match(new RegExp(`(?:^|[\\s;{])--${name}:\\s*([^;]+);`))?.[1]?.trim();

describe.each(Object.entries(themes))("%s theme", (_, path) => {
  const css = read(path);

  test("imports the brand tokens", () => {
    expect(css).toContain('@import "@emblish_workspace/brand/tokens.css"');
  });

  test("has no colour literals of its own", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:oklch|oklab|rgba?|hsla?)\(/);
  });

  test("is light only", () => {
    expect(css).not.toMatch(/^\s*\.dark\s*\{|@variant dark/m);
  });
});

describe("token mapping", () => {
  test("the Storefront uses royal purple as primary on an ivory page", () => {
    const css = read(themes["Storefront (shadcn)"]);
    expect(declaration(css, "primary")).toBe("var(--color-brand-purple)");
    expect(declaration(css, "background")).toBe("var(--color-brand-ivory)");
    expect(declaration(css, "destructive")).toBe("var(--color-brand-danger)");
  });

  test("the Back Office uses royal purple as accent on its ivory screen", () => {
    const css = read(themes["Back Office (HeroUI Native)"]);
    expect(declaration(css, "accent")).toBe("var(--color-brand-purple)");
    expect(declaration(css, "background")).toBe("var(--color-brand-ivory-screen)");
    expect(declaration(css, "danger")).toBe("var(--color-brand-danger)");
  });
});
