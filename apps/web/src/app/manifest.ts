import { brand } from "@emblish_workspace/brand/tokens";
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Emblish",
    short_name: "Emblish",
    description: "Pre-order what you love. We bring it home.",
    start_url: "/",
    display: "standalone",
    background_color: brand.ivory,
    theme_color: brand.purple,
    icons: [
      {
        src: "/favicon/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicon/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
