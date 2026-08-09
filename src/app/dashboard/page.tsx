import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const displayName = session.user.name ?? session.user.email;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-3 border-b px-6 py-3.5">
        <span className="text-sm font-semibold">MoneyTrack</span>
        <span className="flex-1" />
        <SignOutButton />
      </header>

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
    </div>
  );
}
