/** @type {import('next').NextConfig} */

const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["@opentelemetry/api"]
}

module.exports = nextConfig;