import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET as string,
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      // Google asserts the email address as verified, so linking by email is
      // safe here. Do not widen this list without that same guarantee.
      trustedProviders: ["google"],
    },
  },

  user: {
    additionalFields: {
      currency: { type: "string", required: false, input: false },
      numberFormat: { type: "string", required: false, input: false },
      dateFormat: { type: "string", required: false, input: false },
    },
  },

  // nextCookies() must stay last — it is what lets server-side calls set cookies.
  plugins: [nextCookies()],
});
