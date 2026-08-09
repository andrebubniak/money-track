"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await authClient.signOut();
    } catch {
      // Sign-out failed, so the session may still be live. Re-enable the
      // button and stay put rather than redirecting to /login and implying
      // the user is signed out when they might not be.
      setPending(false);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={handleClick}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
