import type { Metadata, Viewport } from "next";
import { Geist_Mono, Josefin_Sans, Yeseva_One } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NativeBridge } from "@/components/native/native-bridge";
import { NativeShell } from "@/components/native/native-shell";
import { PwaSetup } from "@/components/pwa/pwa-setup";
import "./globals.css";

// Site & app font pairing: Yeseva One for display/headings (`--font-serif`)
// and Josefin Sans for body and UI copy (`--font-sans`). Both are self-hosted
// at build time by next/font and placed on <html> so root tokens and portals
// resolve them everywhere across web and the Capacitor iOS/Android shell.
const josefinSans = Josefin_Sans({
  variable: "--font-josefin-sans",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const yesevaOne = Yeseva_One({
  weight: "400",
  variable: "--font-yeseva-one",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#faf8f5",
};

export const metadata: Metadata = {
  title: "AskMySchool",
  // Home-screen name/icon. Child pages only override title/description, and
  // Next merges metadata per key, so these apply on every route (incl. /s/*).
  applicationName: "AskMySchool",
  appleWebApp: {
    title: "AskMySchool",
    capable: true,
    statusBarStyle: "default",
  },
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
    <html lang="en" className={`${josefinSans.variable} ${yesevaOne.variable}`} suppressHydrationWarning>
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
            <NativeShell />
            <PwaSetup />
          </TooltipProvider>
        </div>
      </body>
    </html>
  );
}
