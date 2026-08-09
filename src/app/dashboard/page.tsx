import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const displayName = session.user.name ?? session.user.email;

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
