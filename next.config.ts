import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Picks up `src/i18n/request.ts` by convention.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
};

export default withNextIntl(nextConfig);
