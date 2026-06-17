import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Struxient",
    short_name: "Struxient",
    description:
      "Construction management for trades—quotes, execution, and the Workstation.",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      {
        src: "/brand/struxient-favicon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/brand/struxient-favicon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
