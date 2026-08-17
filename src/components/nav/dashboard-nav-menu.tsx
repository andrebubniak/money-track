"use client";

import { ArrowRightLeft, CreditCard, LayoutDashboard, Tags } from "lucide-react";

import { Link, usePathname } from "@/i18n/navigation";
import {
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface DashboardNavMenuProps {
  dashboardLabel: string;
  transactionsLabel: string;
  categoriesLabel: string;
  cardsLabel: string;
}

/**
 * Sidebar navigation menu for the dashboard, rendering the Dashboard,
 * Transactions, Categories, and Cards items with active-state awareness via
 * usePathname().
 *
 * Dashboard is active only on exactly `/dashboard`; Transactions, Categories,
 * and Cards are each active on their own path prefix and anything under it.
 */
export function DashboardNavMenu({
  dashboardLabel,
  transactionsLabel,
  categoriesLabel,
  cardsLabel,
}: DashboardNavMenuProps) {
  const pathname = usePathname();

  const isDashboardActive = pathname === "/dashboard";
  const isTransactionsActive = pathname.startsWith("/transactions");
  const isCategoriesActive = pathname.startsWith("/categories");
  const isCardsActive = pathname.startsWith("/cards");

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
            tooltip={transactionsLabel}
            isActive={isTransactionsActive}
            render={<Link href="/transactions" />}
          >
            <ArrowRightLeft aria-hidden="true" className="size-6" />
            <span>{transactionsLabel}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={categoriesLabel}
            isActive={isCategoriesActive}
            render={<Link href="/categories" />}
          >
            <Tags aria-hidden="true" className="size-6" />
            <span>{categoriesLabel}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={cardsLabel}
            isActive={isCardsActive}
            render={<Link href="/cards" />}
          >
            <CreditCard aria-hidden="true" className="size-6" />
            <span>{cardsLabel}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  );
}
