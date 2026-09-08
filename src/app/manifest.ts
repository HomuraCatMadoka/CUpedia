import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CUpedia",
    short_name: "CUpedia",
    description: "你的中大百科全书",
    start_url: "/",
    display: "standalone",
    background_color: "#f8e8d2",
    theme_color: "#f8e8d2",
    icons: [
      {
        src: "/icons/cupedia.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
