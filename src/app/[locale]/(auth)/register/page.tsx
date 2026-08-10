import { AppLink } from "@/components/nav/app-link";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

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

export default async function RegisterPage() {
  const locale = await getLocale();
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect({ href: "/dashboard", locale });

  const t = await getTranslations("auth.register");
  const tCommon = await getTranslations("common");

  return (
    <Card className="w-full max-w-100">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          {/* A real <h1>: CardTitle renders a plain div, so without this the
              page has no heading element at all. Tailwind preflight resets
              h1 size/weight/margin to inherit, so this is visually identical. */}
          <h1>{t("title")}</h1>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <RegisterForm />

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">{tCommon("or")}</span>
          <Separator className="flex-1" />
        </div>

        <GoogleButton />

        <p className="text-center text-sm text-muted-foreground">
          {t("hasAccount")}{" "}
          <AppLink href="/login" className="font-medium text-foreground underline underline-offset-4">
            {t("signInLink")}
          </AppLink>
        </p>
      </CardContent>
    </Card>
  );
}
