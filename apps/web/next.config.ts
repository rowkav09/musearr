import type { NextConfig } from 'next'
import path from 'node:path'

const apiUrl = process.env.MUSEARR_API_URL ?? 'http://localhost:4000'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ]
  },
}

export default nextConfig
