import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest and linked from every page by Next. The icons
// are the locked files in public/brand.
//
// `display: "browser"`, not "standalone": a standalone home-screen app on iOS
// gets its own cookie jar, apart from Safari, and the OAuth round trip through
// TidyHQ can bounce into Safari and leave the session in the wrong jar. With
// "browser", Add to Home Screen gives SML's icon and name but opens normally.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SML Check-in",
    short_name: "SML",
    description: "Event check-in and points for Seattle Men in Leather",
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    icons: [
      {
        src: "/brand/sml-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/sml-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/sml-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
