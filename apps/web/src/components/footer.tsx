import Lockup from "./lockup";

const columns = [
  { title: "Shop", items: ["Pre-orders", "In stock", "Categories"] },
  { title: "Help", items: ["My orders", "Pickup & Delivery", "FAQs"] },
] as const;

export default function Footer() {
  return (
    <footer className="bg-brand-purple-deep px-6 pt-8 pb-10 text-sm text-white/70">
      <Lockup onDark />
      <p className="mt-2 font-display text-brand-gold-bright italic">We serve you with care.</p>
      <div className="mt-6 grid max-w-md grid-cols-2 gap-6">
        {columns.map(({ title, items }) => (
          <div key={title} className="space-y-1.5">
            <p className="font-semibold text-brand-gold-bright">{title}</p>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-8 text-white/50 text-xs">© {new Date().getFullYear()} Emblish</p>
    </footer>
  );
}
