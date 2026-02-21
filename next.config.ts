import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["officeparser", "pdfjs-dist", "libreoffice-convert", "resend"],
};

export default nextConfig;
