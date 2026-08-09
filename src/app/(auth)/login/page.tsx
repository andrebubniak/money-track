import { AppLink } from "@/components/nav/app-link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthErrorDialog } from "@/components/auth/auth-error-dialog";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GoogleButton } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import { auth } from "@/lib/auth";

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");

  return (
    <>
      {/* Suspense because the dialog reads searchParams on the client. */}
      <Suspense fallback={null}>
        <AuthErrorDialog />
      </Suspense>

      <Card className="w-full max-w-100">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {/* A real <h1>: CardTitle renders a plain div, so without this the
              page has no heading element at all. Tailwind preflight resets
              h1 size/weight/margin to inherit, so this is visually identical. */}
            <h1>Welcome back</h1>
          </CardTitle>
          <CardDescription>Sign in to continue to your account</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          <LoginForm />

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          <GoogleButton />

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <AppLink
              href="/register"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Sign up
            </AppLink>
          </p>
        </CardContent>
      </Card>
    </>
  );
}
