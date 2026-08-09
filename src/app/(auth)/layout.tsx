import type { ReactNode } from "react";

import { BfcacheGuard } from "@/components/auth/bfcache-guard";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      {/* Both auth pages must re-run their session guard if the browser
          restores them from the back/forward cache. */}
      <BfcacheGuard />
      {children}
    </div>
  );
}
