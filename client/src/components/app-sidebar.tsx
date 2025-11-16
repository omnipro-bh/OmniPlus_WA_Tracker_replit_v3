import {
  Home,
  LayoutDashboard,
  Radio,
  Send,
  Users,
  FileText,
  GitBranch,
  Book,
  Inbox,
  ScrollText,
  CreditCard,
  Settings,
  Shield,
  Wallet,
  User,
  ShieldCheck,
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

  const allMainItems = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      pageKey: "dashboard",
    },
    {
      title: "Channels",
      url: "/channels",
      icon: Radio,
      pageKey: "channels",
    },
    {
      title: "Safety Meter",
      url: "/safety-meter",
      icon: ShieldCheck,
      pageKey: "safetyMeter",
    },
    {
      title: "Send",
      url: "/send",
      icon: Send,
      pageKey: "send",
    },
    {
      title: "Templates",
      url: "/templates",
      icon: FileText,
      pageKey: "templates",
    },
    {
      title: "Workflows",
      url: "/workflows",
      icon: GitBranch,
      pageKey: "workflows",
    },
    {
      title: "Phonebooks",
      url: "/phonebooks",
      icon: Book,
      pageKey: "phonebooks",
    },
    {
      title: "Subscribers",
      url: "/subscribers",
      icon: Users,
      pageKey: "subscribers",
    },
    {
      title: "Outbox",
      url: "/outbox",
      icon: Inbox,
      pageKey: "outbox",
    },
    {
      title: "Workflow Logs",
      url: "/logs",
      icon: ScrollText,
      pageKey: "logs",
    },
    {
      title: "Bulk Logs",
      url: "/bulk-logs",
      icon: FileText,
      pageKey: "bulkLogs",
    },
    {
      title: "Pricing",
      url: "/pricing",
      icon: CreditCard,
      pageKey: "pricing",
    },
    {
      title: "Settings",
      url: "/settings",
      icon: User,
      pageKey: "settings",
    },
  ];

  const effectivePageAccess = (user as any)?.effectivePageAccess || {};
  
  const mainItems = allMainItems.filter(item => {
    if (user?.role === "admin") return true;
    if (!item.pageKey) return true;
    return effectivePageAccess[item.pageKey] === true;
  });

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
