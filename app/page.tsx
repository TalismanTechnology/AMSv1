import type { Metadata, Viewport } from "next";
import { LandingPage } from "@/components/landing/landing-page";

// Server shell for the marketing page. The page itself is a client component
// (scroll-driven motion, video hero); this wrapper exists so the route can
// carry its own title and description.

export const metadata: Metadata = {
  title: "AskMySchool — School Answers You Can Trust",
  description:
    "Ask questions in plain English and get instant answers from your school's official documents — with citations you can verify.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function Page() {
  return <LandingPage />;
}
