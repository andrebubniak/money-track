import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { prisma } from "@/lib/prisma";
import { buildPresetCategoriesData } from "@/lib/category-presets";
import { signUpPayloadSchema } from "@/lib/validations/auth.server";

/**
 * Maps a failed sign-up payload to a stable error code the client can look up
 * in `authErrorMessage`. better-auth does not derive a code from the message,
 * so it is passed explicitly.
 */
function signUpErrorCode(path: PropertyKey | undefined) {
  if (path === "name") return "INVALID_NAME";
  if (path === "email") return "INVALID_EMAIL";
  return "PASSWORD_DOES_NOT_MEET_REQUIREMENTS";
}

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
      // Always show the account chooser. Without this Google silently
      // reuses whichever account is already signed in, which is wrong on a
      // shared machine and makes switching accounts impossible.
      prompt: "select_account",
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

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Each new user gets 11 preset categories. The name and description
          // columns hold English text as a fallback — the app resolves display
          // text through systemLocaleKey (Task 6), so these exact values are
          // rarely shown to users, and only if locale resolution fails.
          await prisma.category.createMany({
            data: buildPresetCategoriesData(user.id),
          });
        },
      },
    },
  },

  onAPIError: {
    // Send every auth failure to our own login page instead of better-auth's
    // unstyled /api/auth/error. The error slug arrives as ?error= and
    // AuthErrorDialog explains it.
    //
    // This matters most for a stale OAuth flow: going Back into a finished
    // Google sign-in replays a callback whose state cookie is already spent,
    // producing `state_mismatch`. Without this the user lands on a raw error
    // page outside the app with no way home.
    //
    // Stays unprefixed: this is static config with no request to negotiate
    // from. The proxy adds the locale on the redirect. `errorCallbackURL` in
    // GoogleButton covers the failures a user actually reaches, so the extra
    // hop only affects flows that bypass the client entirely.
    errorURL: "/login",
  },

  hooks: {
    // Server-side enforcement of the sign-up rules. The forms validate with
    // the same schema for fast feedback, but a direct POST to
    // /api/auth/sign-up/email bypasses the browser entirely — and better-auth's
    // own body schema accepts `name: z.string()` with no bounds at all.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      const result = signUpPayloadSchema.safeParse(ctx.body);
      if (result.success) return;

      const issue = result.error.issues[0];
      throw new APIError("BAD_REQUEST", {
        message: issue.message,
        code: signUpErrorCode(issue.path[0]),
      });
    }),
  },

  // nextCookies() must stay last — it is what lets server-side calls set cookies.
  plugins: [nextCookies()],
});
