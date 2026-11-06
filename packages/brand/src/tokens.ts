/**
 * The Royal & Warm token set, the design source of truth for both apps (#18).
 * `tokens.css` declares the same values as `--color-brand-<name>`; the Storefront maps them
 * onto shadcn and the Back Office onto HeroUI Native. Use these JS values only where CSS
 * can't reach (navigation tint colours, the web manifest).
 */
export const brand = {
  /** Royal purple: primary buttons, links, active tab. */
  purple: "#4A1D6E",
  /** Deep purple: hero start, bands, footer, Back Office header. */
  "purple-deep": "#2A0F42",
  /** Purple mist: soft purple surfaces. */
  "purple-mist": "#F3ECF9",
  /** The hero gradient's last stop, after deep purple and royal purple. */
  "purple-glow": "#6B2FA0",
  /** Emblem gold: icons, Pre-order badges, the Back Office centre button. */
  gold: "#C9962E",
  /** Bright gold: accent text and CTAs on purple. */
  "gold-bright": "#E7BE5C",
  /** Gold mist: promo blocks. */
  "gold-mist": "#FBF3E0",
  /** Gold ink: small text on gold mist, eyebrow labels. */
  "gold-ink": "#6B4A0B",
  /** Ivory: the Storefront page. */
  ivory: "#FBF8F3",
  /** The Back Office screen background. */
  "ivory-screen": "#F7F3EC",
  card: "#FFFFFF",
  muted: "#F4F0EA",
  border: "#ECE5DA",
  ink: "#1F1430",
  "ink-muted": "#6E6478",
  /** OVERDUE, errors, Uncollected counts. */
  danger: "#B4232C",
  /** PAID. */
  success: "#1F7A4D",
} as const;
