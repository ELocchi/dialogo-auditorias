import type { NextConfig } from "next";

const lanDevelopment = Boolean(process.env.LAN_DEV_ORIGIN);

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.LAN_DEV_ORIGIN ? [process.env.LAN_DEV_ORIGIN] : [],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
      // Some browsers send `Origin: null` from a LAN HTTP preview. Permit it
      // only when that preview is explicitly enabled; production stays strict.
      allowedOrigins: lanDevelopment ? ["null"] : [],
    },
  },
  outputFileTracingIncludes: {
    "/app/acompanhamento/relatorio/**/pdf": ["./public/logo-relatorio-orientativo.png"],
    "/api/publications/**": ["./public/logo-relatorio-orientativo.png"],
    "/api/reference-documents/*": ["./private/reference-documents/*.pdf", "./private/reference-documents/*.docx"],
  },
  logging: {
    // Next 16.3 can log Server Function arguments, including form passwords.
    serverFunctions: false,
    browserToTerminal: false,
    incomingRequests: { ignore: [/^\/auth\/callback(?:[/?]|$)/, /^\/confirmar-email(?:[/?]|$)/] },
  },
};

export default nextConfig;
