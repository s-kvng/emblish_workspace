import Image from "next/image";

/**
 * The emblem plus the type-set EMBLISH wordmark (#18): royal purple on light backgrounds,
 * bright gold on deep purple. The yellow full logo never goes on light.
 */
export default function Lockup({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <Image src="/brand/emblem.png" alt="" width={32} height={32} className="size-8" />
      <span
        className={`font-display font-medium text-xl tracking-[0.08em] ${onDark ? "text-brand-gold-bright" : "text-brand-purple"}`}
      >
        EMBLISH
      </span>
    </span>
  );
}
