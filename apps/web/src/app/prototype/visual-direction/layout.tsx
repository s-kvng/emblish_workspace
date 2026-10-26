// PROTOTYPE (wayfinder #18) — loads every candidate font and the Storefront .em skin.
import {
	Bricolage_Grotesque,
	Cinzel,
	DM_Sans,
	Figtree,
	Fraunces,
	Merriweather,
	Plus_Jakarta_Sans,
} from "next/font/google";

import "../storefront/emblish-theme.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const jakarta = Plus_Jakarta_Sans({
	subsets: ["latin"],
	variable: "--font-jakarta",
});
const bricolage = Bricolage_Grotesque({
	subsets: ["latin"],
	variable: "--font-bricolage",
});
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
const cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel" });
const dmsans = DM_Sans({ subsets: ["latin"], variable: "--font-dmsans" });
const merri = Merriweather({
	subsets: ["latin"],
	weight: ["700", "900"],
	variable: "--font-merri",
});

export default function VisualDirectionLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div
			className={[fraunces, jakarta, bricolage, figtree, cinzel, dmsans, merri]
				.map((f) => f.variable)
				.join(" ")}
		>
			{children}
		</div>
	);
}
