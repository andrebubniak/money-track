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
    // Mirrors registerSchema's bound so the server rejects what the client does.
    maxPasswordLength: 60,
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
      trustedProviders: ["google"],
      // `requireLocalEmailVerified` is left at its default of `true`, and that
      // default is what actually protects this app — NOT `trustedProviders`.
      //
      // The risk is pre-hijacking: because `requireEmailVerification` is off,
      // anyone can register victim@gmail.com with a password without proving
      // they own it. If a Google sign-in then linked into that row, the
      // attacker would keep password access to the victim's account forever.
      // Trusting Google's assertion says nothing about whether the *local*
      // account was ever proven — it is the wrong side of the relationship.
      //
      // Consequence, and it is deliberate: since password accounts keep
      // `emailVerified: false` permanently, a Google sign-in to an address
      // that already has a password account is REFUSED, not linked. See
      // node_modules/better-auth/dist/oauth2/link-account.mjs:22-24.
      //
      // Do NOT set `requireLocalEmailVerified: false` to "make linking work".
      // That reintroduces the takeover above, and better-auth has deprecated
      // the option — the gate becomes unconditional in a coming release. The
      // real fix, if linking is wanted, is to verify email ownership first.
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
