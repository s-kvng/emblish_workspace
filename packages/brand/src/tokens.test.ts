import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { brand } from "./tokens";

const tokensCss = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

// The Royal & Warm token table from "Visual direction for Storefront and Back Office" (#18).
const ROYAL_AND_WARM = {
  purple: "#4A1D6E",
  "purple-deep": "#2A0F42",
  "purple-mist": "#F3ECF9",
  "purple-glow": "#6B2FA0",
  gold: "#C9962E",
  "gold-bright": "#E7BE5C",
  "gold-mist": "#FBF3E0",
  "gold-ink": "#6B4A0B",
  ivory: "#FBF8F3",
  "ivory-screen": "#F7F3EC",
  card: "#FFFFFF",
  muted: "#F4F0EA",
  border: "#ECE5DA",
  ink: "#1F1430",
  "ink-muted": "#6E6478",
  danger: "#B4232C",
  success: "#1F7A4D",
};

describe("brand tokens", () => {
  test("are the Royal & Warm palette", () => {
    expect<Record<string, string>>(brand).toEqual(ROYAL_AND_WARM);
  });

  test("the CSS theme declares every token as --color-brand-<name> with the same value", () => {
    const declared = Object.fromEntries(
      [...tokensCss.matchAll(/--color-brand-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(
        ([, name, hex]) => [name, hex?.toUpperCase()],
      ),
    );
    expect(declared).toEqual(ROYAL_AND_WARM);
  });
});
