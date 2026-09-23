import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// The whole UI sets in Helvetica Neue Light (the `--font-sans` stack in
// globals.css); this stylesheet supplies that face, with the system
// Helvetica / Arial as fallbacks in the stack itself.
const HELVETICA_NEUE_LIGHT_HREF =
  "https://db.onlinewebfonts.com/c/0e6de1ec911a2e267ff136bbdd384a44?family=Helvetica+Neue+Light";

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
    <html lang="en">
      <head>
        <link rel="stylesheet" href={HELVETICA_NEUE_LIGHT_HREF} />
      </head>
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
          </TooltipProvider>
        </div>
      </body>
    </html>
  );
}
