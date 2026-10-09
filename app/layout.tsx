import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NativeBridge } from "@/components/native/native-bridge";
import "./globals.css";

// The whole UI sets in Inter (the `--font-sans` stack in globals.css), at a
// light base weight to keep the airy look the UI had with Helvetica Neue
// Light. next/font downloads Inter (SIL Open Font License) at build time and
// serves it from our own domain: no third-party font request at runtime, so
// visitors' IPs aren't sent to a font CDN, and no unlicensed Helvetica Neue
// files. It's a variable font, so real 300-700 weights replace the synthetic
// bold the single-weight Helvetica face needed.
//
// The variable goes on <html> so the :root `--font-sans` token can resolve it.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#faf8f5",
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
    // Browser extensions (e.g. QuillBot's data-qb-installed) stamp attributes
    // onto <html> before hydration. This only silences attribute mismatches on
    // this one element, not on anything inside it.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className={`${geistMono.variable} antialiased`}>
        <div
          style={{
            position: "relative",
            isolation: "isolate",
            minHeight: "100vh",
          }}
        >
          <TooltipProvider>
            {children}
            <Toaster />
            <NativeBridge />
          </TooltipProvider>
        </div>
      </body>
    </html>
  );
}
