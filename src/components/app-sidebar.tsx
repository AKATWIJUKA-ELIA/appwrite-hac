"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Plus, Receipt } from "lucide-react";
import { AccountMenu, type AccountSummary } from "@/components/account-menu";
import { Brand } from "@/components/brand";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { HOME_PATH } from "@/lib/auth/constants";
import { formatRelative } from "@/lib/format";
import type { RequestSummary } from "@/lib/requests/queries";
import { cn } from "@/lib/utils";
import { STATUS_COPY, type Tone } from "@/lib/vocabulary";

const DOT_TONE: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  busy: "bg-track-web",
  action: "bg-warning",
  good: "bg-success",
  bad: "bg-destructive",
};

/**
 * Request history. Procurement is repeat work — the same buyer sources the
 * same categories month after month — so past requests are navigation, not an
 * archive.
 */
export function AppSidebar({
  account,
  requests,
}: Readonly<{ account: AccountSummary; requests: RequestSummary[] }>) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href={HOME_PATH} />}>
              <Brand />
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="New request"
              isActive={pathname === HOME_PATH}
              render={<Link href={HOME_PATH} />}
              className="bg-primary font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground data-active:bg-primary data-active:text-primary-foreground"
            >
              <Plus />
              <span>New request</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>History</SidebarGroupLabel>
          <SidebarGroupContent>
            {requests.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                <FileText className="size-6 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">
                  No requests yet. Your first one appears here.
                </p>
              </div>
            ) : (
              <SidebarMenu>
                {requests.map((request) => {
                  const href = `/requests/${request.$id}`;
                  const tone = STATUS_COPY[request.status].tone;
                  return (
                    <SidebarMenuItem key={request.$id}>
                      <SidebarMenuButton
                        isActive={pathname === href}
                        render={<Link href={href} />}
                        className="h-auto flex-col items-start gap-1 py-2"
                      >
                        <span className="line-clamp-2 text-sm leading-snug">{request.title}</span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              DOT_TONE[tone],
                              tone === "busy" && "animate-live",
                            )}
                          />
                          <span className="text-xs text-muted-foreground">
                            {formatRelative(request.$createdAt)}
                          </span>
                          {/* A supplier actually answered this one. Without the
                              badge, finding the request with a real reply means
                              opening every row in the list. */}
                          {request.confirmedQuotes > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-1.5 py-px text-[10px] font-medium text-success">
                              <Receipt className="size-2.5" />
                              {request.confirmedQuotes}
                            </span>
                          )}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu account={account} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
