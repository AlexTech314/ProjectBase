import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_MAIN_API_URL: "https://3c5pp045vl.execute-api.us-west-1.amazonaws.com/prod"
  }
};

export default nextConfig;
