import { Search, User } from "lucide-react";
import Link from "next/link";

import BagButton from "./bag-button";
import Lockup from "./lockup";

// Search is a placeholder until that flow lands.
const actions = [{ label: "Search", Icon: Search }] as const;

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
        <Link
          href="/orders"
          aria-label="My orders"
          className="grid size-10 place-items-center rounded-full hover:bg-secondary"
        >
          <User className="size-5" />
        </Link>
        <BagButton />
      </nav>
    </header>
  );
}
