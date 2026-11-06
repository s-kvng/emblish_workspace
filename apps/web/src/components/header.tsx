import { Search, ShoppingBag, User } from "lucide-react";
import Link from "next/link";

import Lockup from "./lockup";

// Search, My orders and the bag are placeholders until those flows land.
const actions = [
  { label: "Search", Icon: Search },
  { label: "My orders", Icon: User },
  { label: "Bag", Icon: ShoppingBag },
] as const;

export default function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-3">
      <Link href="/" aria-label="Emblish home">
        <Lockup />
      </Link>
      <nav className="flex items-center gap-1 text-brand-purple">
        {actions.map(({ label, Icon }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            className="grid size-10 place-items-center rounded-full hover:bg-secondary"
          >
            <Icon className="size-5" />
          </button>
        ))}
      </nav>
    </header>
  );
}
