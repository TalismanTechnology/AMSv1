import type { MetadataRoute } from "next";

// Web app manifest (served at /manifest.webmanifest). Gives Android/Chrome and
// iOS "Add to Home Screen" the real name and logo instead of the page title and
// a generated letter icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Stable app identity for installs, independent of start_url changes.
    id: "/",
    name: "AskMySchool",
    short_name: "AskMySchool",
    description:
      "Ask questions in plain English and get instant answers from your school's official documents.",
    // Signed-in users land on their dashboard (/login redirects them), the
    // same place the iOS / Android app opens; signed-out users pick a school.
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#faf8f5",
    theme_color: "#faf8f5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
