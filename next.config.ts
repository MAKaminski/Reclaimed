import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Staff-only application. There is no public data surface by design — see
  // docs/DECISIONS.md ADR-0002 and O.C.G.A. § 44-12-239.1(b).
  poweredByHeader: false,
  reactStrictMode: true,
}

export default nextConfig
