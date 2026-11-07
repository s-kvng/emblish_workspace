import { ShoppingBag } from "lucide-react";
import Image from "next/image";

/** A Product photo from Convex storage, or a soft placeholder when there isn't one. */
export default function ProductPhoto({
  url,
  alt,
  className = "",
  sizes = "(min-width: 768px) 33vw, 50vw",
  priority = false,
}: {
  url?: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden bg-brand-purple-mist ${className}`}>
      {url ? (
        // Convex serves the files already sized; Next only lays them out.
        <Image
          src={url}
          alt={alt}
          fill
          unoptimized
          priority={priority}
          sizes={sizes}
          className="object-cover"
        />
      ) : (
        <ShoppingBag
          aria-hidden
          strokeWidth={1.1}
          className="absolute inset-0 m-auto size-1/3 text-brand-purple/40"
        />
      )}
    </div>
  );
}
