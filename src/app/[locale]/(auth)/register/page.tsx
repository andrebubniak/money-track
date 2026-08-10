import { AppLink } from "@/components/nav/app-link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GoogleButton } from "@/components/auth/google-button";
import { RegisterForm } from "@/components/auth/register-form";
import { auth } from "@/lib/auth";

export default async function RegisterPage({ params }: PageProps<"/[locale]/register">) {
  const { locale } = await params;
  // Next generates `locale` as a plain `string`; `hasLocale` narrows it to
  // next-intl's `Locale` union, which `redirect` requires. The layout above
  // already 404s on anything outside `routing.locales`, so this is never
  // actually reached with an unsupported tag.
  if (!hasLocale(routing.locales, locale)) notFound();
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect({ href: "/dashboard", locale });

  return (
    <Card className="w-full max-w-100">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          {/* A real <h1>: CardTitle renders a plain div, so without this the
              page has no heading element at all. Tailwind preflight resets
              h1 size/weight/margin to inherit, so this is visually identical. */}
          <h1>Create your account</h1>
        </CardTitle>
        <CardDescription>Start tracking where your money goes</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <RegisterForm />

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        <GoogleButton />

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <AppLink href="/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </AppLink>
        </p>
      </CardContent>
    </Card>
  );
}
