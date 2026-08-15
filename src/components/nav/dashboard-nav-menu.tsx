"use client";

import { LayoutDashboard, Tags } from "lucide-react";

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
}

/**
 * Sidebar navigation menu for the dashboard, rendering both Dashboard and
 * Categories items with active-state awareness via usePathname().
 *
 * Dashboard is active only on exactly `/dashboard`; Categories is active on
 * `/dashboard/categories` and anything under it.
 */
export function DashboardNavMenu({ dashboardLabel, categoriesLabel }: DashboardNavMenuProps) {
  const pathname = usePathname();

  const isDashboardActive = pathname === "/dashboard";
  const isCategoriesActive = pathname.startsWith("/dashboard/categories");

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
      </SidebarMenu>
    </SidebarGroupContent>
  );
}
