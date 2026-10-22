// PROTOTYPE — scopes the Emblish brand skin and fonts to the Storefront prototype route.
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";

import "./emblish-theme.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-em-display" });
const sans = Plus_Jakarta_Sans({
	subsets: ["latin"],
	variable: "--font-em-sans",
});

export default function StorefrontPrototypeLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className={`em ${display.variable} ${sans.variable}`}>{children}</div>
	);
}
