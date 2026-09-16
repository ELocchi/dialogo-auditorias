import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  outputFileTracingIncludes: {
    "/api/reference-documents/*": ["./private/reference-documents/*.pdf", "./private/reference-documents/*.docx"],
  },
  logging: {
    // Next 16.3 can log Server Function arguments, including form passwords.
    serverFunctions: false,
    browserToTerminal: false,
    incomingRequests: { ignore: [/^\/auth\/callback(?:[/?]|$)/] },
  },
};

export default nextConfig;
