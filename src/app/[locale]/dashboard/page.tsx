import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const locale = await getLocale();
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  // `return`, not a bare statement: next-intl's `redirect` return type is
  // structurally `never`, but it is built from a conditional type TypeScript
  // does not resolve to the exact `never` singleton its unreachable-code
  // analysis checks for — so without `return`, `session` below stays typed
  // as possibly `null`. An explicit `return` sidesteps that: the statement
  // itself, not the callee's type, is what narrows.
  if (!session) return redirect({ href: "/login", locale });

  // `||` not `??`: a Google profile with no name persists as an empty string,
  // which `??` would pass through and render as "Signed in ()".
  const displayName = session.user.name || session.user.email;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2.5 px-5 py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Signed in ({displayName})
      </h1>
      <p className="font-mono text-sm text-muted-foreground">{session.user.email}</p>
      <p className="mt-4 max-w-[42ch] rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
        Placeholder page. This route becomes the real spending dashboard
        described in the PRD.
      </p>
    </main>
  );
}
