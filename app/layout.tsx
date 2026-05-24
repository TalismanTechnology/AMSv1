import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopographicBackground } from "@/components/ui/topographic-background";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1a1a2e" },
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  ],
};

export const metadata: Metadata = {
  title: "AskMySchool",
  description:
    "AI-powered school document search. Parents can ask questions and get instant answers from school documents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div
          style={{
            position: "relative",
            isolation: "isolate",
            minHeight: "100vh",
          }}
        >
          {/* Fixed (not absolute) so the canvas only ever needs to be
              viewport-sized — an absolute canvas spanning the whole
              document gets clipped on long pages once it exceeds the
              browser's max canvas size, leaving the lower page untextured. */}
          <TopographicBackground
            style={{
              position: "fixed",
              inset: 0,
              zIndex: -1,
            }}
            intensity="full"
          />
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </div>
      </body>
    </html>
  );
}
