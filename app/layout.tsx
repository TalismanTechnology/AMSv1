import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
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
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <div
            style={{
              position: "relative",
              isolation: "isolate",
              minHeight: "100vh",
            }}
          >
            <TopographicBackground
              style={{
                position: "absolute",
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
        </ThemeProvider>
      </body>
    </html>
  );
}
