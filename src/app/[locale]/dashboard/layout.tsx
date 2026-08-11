import type { ReactNode } from "react";
import { LayoutDashboard } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { LocaleSwitcher } from "@/components/nav/locale-switcher";
import { Link } from "@/i18n/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * The app shell.
 *
 * Deliberately holds **no** session check. `dashboard/page.tsx` owns the
 * authoritative `auth.api.getSession()` call, and its `redirect()` throws
 * during render — so nothing here ever reaches a signed-out visitor's browser.
 * Duplicating the check here would cost a second database query per request
 * and invite the mistake of treating a layout as a security boundary, which it
 * is not: layouts do not re-render on client-side navigation.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
                {tCommon("appName")}
              </span>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={t("navLabel")}
                      isActive
                      // Plain Link, not AppLink: navigation *inside* the shell is covered
                      // by the segment's loading.tsx skeleton. See
                      // .claude/rules/navigation-loading.md.
                      render={<Link href="/dashboard" />}
                    >
                      <LayoutDashboard aria-hidden="true" />
                      <span>{t("navLabel")}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          {/* Pinned to the bottom: SidebarContent above it takes the flex-1. */}
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <LocaleSwitcher />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SignOutButton />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
