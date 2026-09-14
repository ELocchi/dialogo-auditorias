import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    // Next 16.3 can log Server Function arguments, including form passwords.
    serverFunctions: false,
    browserToTerminal: false,
    incomingRequests: { ignore: [/^\/auth\/callback(?:[/?]|$)/] },
  },
};

export default nextConfig;
