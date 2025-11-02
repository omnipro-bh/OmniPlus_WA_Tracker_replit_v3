import {
  Home,
  LayoutDashboard,
  Radio,
  Send,
  Users,
  FileText,
  GitBranch,
  Inbox,
  ScrollText,
  CreditCard,
  Settings,
  Shield,
  Wallet,
  User,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { MessageSquare } from "lucide-react";

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  const mainItems = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Channels",
      url: "/channels",
      icon: Radio,
    },
    {
      title: "Send",
      url: "/send",
      icon: Send,
    },
    {
      title: "Bulk",
      url: "/bulk",
      icon: Users,
    },
    {
      title: "Templates",
      url: "/templates",
      icon: FileText,
    },
    {
      title: "Workflows",
      url: "/workflows",
      icon: GitBranch,
    },
    {
      title: "Outbox",
      url: "/outbox",
      icon: Inbox,
    },
    {
      title: "Workflow Logs",
      url: "/logs",
      icon: ScrollText,
    },
    {
      title: "Bulk Logs",
      url: "/bulk-logs",
      icon: FileText,
    },
    {
      title: "Pricing",
      url: "/pricing",
      icon: CreditCard,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: User,
    },
  ];

  const adminItems = user?.role === "admin" ? [
    {
      title: "Admin",
      url: "/admin",
      icon: Shield,
    },
    {
      title: "Balances",
      url: "/admin/balances",
      icon: Wallet,
    },
    {
      title: "WHAPI Settings",
      url: "/admin/whapi-settings",
      icon: Settings,
    },
  ] : [];

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold">omniplus</span>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">WA Tracker</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`link-${item.title.toLowerCase()}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {adminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      data-testid={`link-${item.title.toLowerCase()}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="text-xs text-muted-foreground">
          {user?.name || "User"}
        </div>
        <div className="text-xs text-muted-foreground">{user?.email}</div>
      </SidebarFooter>
    </Sidebar>
  );
}
