/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next's CLI type-check subprocess drops --showConfig output under Node 26.
    // TypeScript 5.9 has a supported compiler API, which avoids that Node issue.
    useTypeScriptCli: false,
    optimizePackageImports: ['@razorpay/blade/components'],
  },
};

export default nextConfig;
