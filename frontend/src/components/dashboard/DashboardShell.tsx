import { ReactNode } from "react";

import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

interface DashboardShellProps {
  children: ReactNode;
  title?: string;
  variant?: "standard" | "pro" | "enterprise";
}

function DashboardShellContent({ children, title }: Pick<DashboardShellProps, "children" | "title">) {
  const { isMobile, state } = useSidebar();
  const showSidebarTrigger = isMobile || state === "collapsed";

  return (
    <div className="flex min-h-screen w-full bg-[linear-gradient(180deg,#f6f7f4_0%,#f7f8f6_100%)] dark:bg-[linear-gradient(180deg,rgba(10,15,13,1),rgba(14,22,18,1))]">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/88 backdrop-blur">
          <div className="flex min-h-[3.35rem] items-center gap-3 px-4 md:px-5 lg:px-6">
            {showSidebarTrigger ? <SidebarTrigger className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-muted" /> : null}
            {title ? (
              <h1 className="font-display text-[1.55rem] font-bold leading-none text-foreground lg:text-[1.7rem]">{title}</h1>
            ) : null}
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden p-4 md:p-5 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardShell({ children, title }: DashboardShellProps) {
  return (
    <SidebarProvider>
      <DashboardShellContent title={title}>{children}</DashboardShellContent>
    </SidebarProvider>
  );
}
