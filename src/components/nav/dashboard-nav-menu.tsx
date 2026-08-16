"use client";

import { CreditCard, LayoutDashboard, Tags } from "lucide-react";

import { Link, usePathname } from "@/i18n/navigation";
import {
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface DashboardNavMenuProps {
  dashboardLabel: string;
  categoriesLabel: string;
  cardsLabel: string;
}

/**
 * Sidebar navigation menu for the dashboard, rendering the Dashboard,
 * Categories, and Cards items with active-state awareness via usePathname().
 *
 * Dashboard is active only on exactly `/dashboard`; Categories and Cards are
 * each active on their own path prefix and anything under it.
 */
export function DashboardNavMenu({ dashboardLabel, categoriesLabel, cardsLabel }: DashboardNavMenuProps) {
  const pathname = usePathname();

  const isDashboardActive = pathname === "/dashboard";
  const isCategoriesActive = pathname.startsWith("/dashboard/categories");
  const isCardsActive = pathname.startsWith("/dashboard/cards");

  return (
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={dashboardLabel}
            isActive={isDashboardActive}
            render={<Link href="/dashboard" />}
          >
            <LayoutDashboard aria-hidden="true" className="size-6" />
            <span>{dashboardLabel}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={categoriesLabel}
            isActive={isCategoriesActive}
            render={<Link href="/dashboard/categories" />}
          >
            <Tags aria-hidden="true" className="size-6" />
            <span>{categoriesLabel}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={cardsLabel}
            isActive={isCardsActive}
            render={<Link href="/dashboard/cards" />}
          >
            <CreditCard aria-hidden="true" className="size-6" />
            <span>{cardsLabel}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  );
}
