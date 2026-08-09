"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

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
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start"
      disabled={pending}
      onClick={handleClick}
    >
      <LogOut aria-hidden="true" />
      {/* sr-only, not hidden: `display:none` removes the text from the
          accessibility tree, leaving the button with no accessible name at
          all once the rail collapses to icons. */}
      <span className="group-data-[collapsible=icon]:sr-only">
        {pending ? "Signing out…" : "Sign out"}
      </span>
    </Button>
  );
}
