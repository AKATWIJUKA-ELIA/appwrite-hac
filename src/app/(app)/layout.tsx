import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/auth/session";
import { listMyRequests } from "@/lib/requests/queries";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const requests = await listMyRequests();
  const account = {
    name: user.name,
    email: user.email,
    organisation: user.prefs.organisation,
  };

  return (
    <SidebarProvider>
      <AppSidebar account={account} requests={requests} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm text-muted-foreground">
            {account.organisation ?? "Procurement"}
          </span>
        </header>
        <div className="flex-1 p-4 md:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
