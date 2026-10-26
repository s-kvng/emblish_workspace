// PROTOTYPE (wayfinder #18): three refinements of the purple/gold brand. Each direction is
// only tokens: the Storefront Home reads them through the .em skin, the Back Office mock
// and the style tile read them directly.

export type Direction = {
	key: string;
	name: string;
	pitch: string;
	bestFor: string;
	watchOut: string;
	fonts: {
		display: string;
		sans: string;
		displayName: string;
		sansName: string;
	};
	/** CSS variables applied on the .em wrapper (Storefront skin). */
	skin: Record<string, string>;
	swatches: { role: string; hex: string; ink?: string }[];
	bo: {
		bg: string;
		headerBg: string;
		headerInk: string;
		bannerBg: string;
		bannerInk: string;
		ctaBg: string;
		ctaInk: string;
		card: string;
		cardBorder: string;
		ink: string;
		muted: string;
		count: string;
		urgent: string;
		tabBg: string;
		tabInk: string;
		tabActive: string;
		fabBg: string;
		fabInk: string;
	};
	logo: "light" | "pill" | "black";
	tone: {
		label: string;
		headline: string;
		sms: string;
		empty: string;
		error: string;
		note: string;
	};
};

export const directions: Direction[] = [
	{
		key: "A",
		name: "Royal & Warm",
		pitch:
			"The provisional skin, refined. Deep purple carries the brand, metallic gold from the emblem marks what matters, on a warm ivory page. A soft serif for headlines, a clean sans for everything you read.",
		bestFor:
			"Trust and a little occasion: it feels like a shop that cares, without feeling expensive.",
		watchOut:
			"Purple-heavy hero and bands can feel formal next to an 'everyday value' promise.",
		fonts: {
			display: "var(--font-fraunces)",
			sans: "var(--font-jakarta)",
			displayName: "Fraunces",
			sansName: "Plus Jakarta Sans",
		},
		skin: {
			"--em-purple": "#4a1d6e",
			"--em-purple-deep": "#2a0f42",
			"--em-purple-soft": "#f3ecf9",
			"--em-gold": "#c9962e",
			"--em-gold-bright": "#e7be5c",
			"--em-gold-soft": "#fbf3e0",
			"--em-gold-ink": "#6b4a0b",
			"--em-ink": "#1f1430",
			"--background": "#fbf8f3",
		},
		swatches: [
			{ role: "Royal purple · primary", hex: "#4A1D6E", ink: "#fff" },
			{ role: "Deep purple · bands", hex: "#2A0F42", ink: "#fff" },
			{ role: "Emblem gold · accent", hex: "#C9962E", ink: "#2A0F42" },
			{ role: "Bright gold · on dark", hex: "#E7BE5C", ink: "#2A0F42" },
			{ role: "Ivory · page", hex: "#FBF8F3" },
			{ role: "Gold mist · promos", hex: "#FBF3E0" },
			{ role: "Ink · text", hex: "#1F1430", ink: "#fff" },
			{ role: "Danger · overdue", hex: "#B4232C", ink: "#fff" },
		],
		bo: {
			bg: "#f7f3ec",
			headerBg: "#2a0f42",
			headerInk: "#ffffff",
			bannerBg: "#4a1d6e",
			bannerInk: "#ffffff",
			ctaBg: "#e7be5c",
			ctaInk: "#2a0f42",
			card: "#ffffff",
			cardBorder: "#ece5da",
			ink: "#1f1430",
			muted: "#6e6478",
			count: "#4a1d6e",
			urgent: "#b4232c",
			tabBg: "#ffffff",
			tabInk: "#8a8094",
			tabActive: "#4a1d6e",
			fabBg: "#c9962e",
			fabInk: "#2a0f42",
		},
		logo: "light",
		tone: {
			label: "Warm and gracious: the tagline, said out loud",
			headline: "Bring it home before it lands.",
			sms: "Good news, Ama! Your Linen Kaftan has arrived in Accra. Shipping Fee: GHS 45. Pay here: emblish.com/pay/8KQ2 - Emblish",
			empty:
				"No orders yet. When you pre-order, we'll keep you posted here and by SMS.",
			error:
				"Sorry, that code doesn't match. Please check your SMS and try again.",
			note: "1 SMS segment. SMS copy says GHS, not GH₵: the cedi sign isn't in the GSM alphabet and would double the cost.",
		},
	},
	{
		key: "B",
		name: "Market Day",
		pitch:
			"Taken from the logo's tagline pill: sunny yellow and bright purple on clean white. Bold, friendly grotesque headlines, prices that shout. Gold lives only in the emblem.",
		bestFor:
			"Everyday value: reads as cheerful, affordable and easy, like a busy, well-run market stall.",
		watchOut:
			"Yellow fights with product photos if overused; keep it to the hero, price pills and one highlight per screen.",
		fonts: {
			display: "var(--font-bricolage)",
			sans: "var(--font-figtree)",
			displayName: "Bricolage Grotesque",
			sansName: "Figtree",
		},
		skin: {
			"--em-purple": "#5b1f8e",
			"--em-purple-deep": "#2e0f4a",
			"--em-purple-soft": "#f2eafb",
			"--em-gold": "#f2c230",
			"--em-gold-bright": "#ffd84a",
			"--em-gold-soft": "#fff6cc",
			"--em-gold-ink": "#6a4e00",
			"--em-ink": "#22113a",
			"--background": "#ffffff",
			"--muted": "#f6f3fa",
			"--muted-foreground": "#6b5e7b",
			"--border": "#ece6f3",
			"--input": "#ece6f3",
			"--em-header-bg": "#ffffff",
			"--em-hero-bg": "#ffd84a",
			"--em-hero-ink": "#2e0f4a",
			"--em-hero-accent": "#5b1f8e",
			"--em-hero-cta-bg": "#5b1f8e",
			"--em-hero-cta-ink": "#ffffff",
			"--em-band-bg": "#5b1f8e",
			"--em-band-accent": "#ffd84a",
			"--em-tile-l": "0.96",
			"--em-tile-c": "0.05",
			"--em-badge-warm-bg": "#ffd84a",
			"--em-badge-warm-ink": "#2e0f4a",
			"--em-promo-bg": "#f2eafb",
			"--em-promo-ink": "#2e0f4a",
			"--em-promo-sub": "#6b5e7b",
			"--em-display-weight": "800",
			"--em-display-tracking": "-0.025em",
		},
		swatches: [
			{ role: "Bright purple · primary", hex: "#5B1F8E", ink: "#fff" },
			{ role: "Sunny yellow · highlight", hex: "#FFD84A", ink: "#2E0F4A" },
			{ role: "Deep purple · text on yellow", hex: "#2E0F4A", ink: "#fff" },
			{ role: "Emblem gold · logo only", hex: "#C9962E", ink: "#2E0F4A" },
			{ role: "White · page", hex: "#FFFFFF" },
			{ role: "Lilac · promos", hex: "#F2EAFB" },
			{ role: "Ink · text", hex: "#22113A", ink: "#fff" },
			{ role: "Danger · overdue", hex: "#D42A3A", ink: "#fff" },
		],
		bo: {
			bg: "#f6f3fa",
			headerBg: "#ffd84a",
			headerInk: "#2e0f4a",
			bannerBg: "#5b1f8e",
			bannerInk: "#ffffff",
			ctaBg: "#ffd84a",
			ctaInk: "#2e0f4a",
			card: "#ffffff",
			cardBorder: "#ece6f3",
			ink: "#22113a",
			muted: "#6b5e7b",
			count: "#5b1f8e",
			urgent: "#d42a3a",
			tabBg: "#ffffff",
			tabInk: "#9a90a8",
			tabActive: "#5b1f8e",
			fabBg: "#5b1f8e",
			fabInk: "#ffd84a",
		},
		logo: "pill",
		tone: {
			label: "Plain and cheerful: short words, prices first",
			headline: "Order today. Pay shipping when it lands.",
			sms: "Ama, it's here! 🎉 Your Linen Kaftan has landed. Pay GH₵ 45 shipping: emblish.com/pay/8KQ2 then pick up or get it delivered.",
			empty:
				"Nothing here yet. Find something you love — it's cheaper to pre-order.",
			error: "That code didn't work. Check your SMS and try again.",
			note: "The emoji and ₵ force Unicode SMS (70 chars/segment), so this costs 2 segments. Whatever the direction: GHS and no emoji in SMS.",
		},
	},
	{
		key: "C",
		name: "Night Gold",
		pitch:
			"The logo, literally: near-black surfaces, gold and logo-yellow type, purple as a jewel accent. Engraved capitals for headlines echo the EMBLISH wordmark.",
		bestFor:
			"Instant recognition from the existing logo and signage; striking on Instagram.",
		watchOut:
			"Dark and gold reads premium, which pulls against 'everyday value'. Dark screens are harder to read at a sunny counter, and product photos on black need care.",
		fonts: {
			display: "var(--font-cinzel)",
			sans: "var(--font-dmsans)",
			displayName: "Cinzel",
			sansName: "DM Sans",
		},
		skin: {
			"color-scheme": "dark",
			"--em-purple": "#8a4fc8",
			"--em-purple-deep": "#1a0f26",
			"--em-purple-soft": "#2a1c3a",
			"--em-gold": "#d9ae4e",
			"--em-gold-bright": "#f2cf6b",
			"--em-gold-soft": "#2a2214",
			"--em-gold-ink": "#e8d3a0",
			"--em-ink": "#f5efe3",
			"--background": "#0d0a10",
			"--card": "#17121d",
			"--muted": "#221b2a",
			"--muted-foreground": "#a69db0",
			"--border": "#2e2638",
			"--input": "#2e2638",
			"--primary": "#d9ae4e",
			"--primary-foreground": "#140d05",
			"--ring": "#d9ae4e",
			"--em-header-ink": "#f2cf6b",
			"--em-wordmark": "#f2cf6b",
			"--em-hero-bg":
				"radial-gradient(circle at 75% 15%, #3a1f55, #0d0a10 70%)",
			"--em-hero-ink": "#f5efe3",
			"--em-hero-accent": "#f2cf6b",
			"--em-hero-cta-bg": "#d9ae4e",
			"--em-hero-cta-ink": "#140d05",
			"--em-band-bg": "#1a0f26",
			"--em-band-ink": "#f5efe3",
			"--em-band-accent": "#f2cf6b",
			"--em-tile-l": "0.27",
			"--em-tile-c": "0.05",
			"--em-badge-hot-bg": "#8a4fc8",
			"--em-badge-warm-bg": "#d9ae4e",
			"--em-badge-warm-ink": "#140d05",
			"--em-link": "#f2cf6b",
			"--em-promo-bg": "#2a2214",
			"--em-promo-ink": "#f2cf6b",
			"--em-promo-sub": "#c9b98f",
			"--em-display-weight": "600",
			"--em-display-tracking": "0.01em",
		},
		swatches: [
			{ role: "Night · page", hex: "#0D0A10", ink: "#F5EFE3" },
			{ role: "Velvet · cards", hex: "#17121D", ink: "#F5EFE3" },
			{ role: "Emblem gold · primary", hex: "#D9AE4E", ink: "#140D05" },
			{ role: "Logo yellow · type on dark", hex: "#F2CF6B", ink: "#140D05" },
			{ role: "Jewel purple · accent", hex: "#8A4FC8", ink: "#fff" },
			{ role: "Plum night · bands", hex: "#1A0F26", ink: "#F5EFE3" },
			{ role: "Cream · text", hex: "#F5EFE3" },
			{ role: "Danger · overdue", hex: "#F0606A", ink: "#140D05" },
		],
		bo: {
			bg: "#0d0a10",
			headerBg: "#0d0a10",
			headerInk: "#f2cf6b",
			bannerBg: "linear-gradient(135deg, #d9ae4e, #f2cf6b)",
			bannerInk: "#140d05",
			ctaBg: "#140d05",
			ctaInk: "#f2cf6b",
			card: "#17121d",
			cardBorder: "#2e2638",
			ink: "#f5efe3",
			muted: "#a69db0",
			count: "#f2cf6b",
			urgent: "#f0606a",
			tabBg: "#17121d",
			tabInk: "#7d7488",
			tabActive: "#f2cf6b",
			fabBg: "#d9ae4e",
			fabInk: "#140d05",
		},
		logo: "black",
		tone: {
			label: "Confident and concise: few words, all business",
			headline: "Ordered abroad. Delivered with care.",
			sms: "EMBLISH: Your Linen Kaftan has arrived. Shipping Fee GHS 45. Pay at emblish.com/pay/8KQ2. Your Pickup Code follows once paid.",
			empty: "No orders yet.",
			error: "Code not recognised. Check your SMS.",
			note: "1 SMS segment (GSM-7).",
		},
	},
];
