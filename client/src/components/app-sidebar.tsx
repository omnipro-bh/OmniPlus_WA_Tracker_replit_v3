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
  Database,
  Calendar,
  ChevronDown,
  Tag,
  Sparkles,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { MessageSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, useEffect } from "react";

type NavChild = {
  title: string;
  url: string;
  children?: NavChild[];
};

type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  pageKey?: string;
  children?: NavChild[];
};

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { state: sidebarState } = useSidebar();
  const { user } = useAuth();

  const [bookingExpanded, setBookingExpanded] = useState(
    location === "/booking-scheduler" || location.startsWith("/booking-scheduler/"),
  );
  const [bookingsExpanded, setBookingsExpanded] = useState(
    location.startsWith("/booking-scheduler/bookings") || location.startsWith("/booking-scheduler/calendar"),
  );

  useEffect(() => {
    if (location === "/booking-scheduler" || location.startsWith("/booking-scheduler/")) {
      setBookingExpanded(true);
    }
    if (location.startsWith("/booking-scheduler/bookings") || location.startsWith("/booking-scheduler/calendar")) {
      setBookingsExpanded(true);
    }
  }, [location]);

  const allMainItems: NavItem[] = [
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
      title: "AI Studio",
      url: "/ai-studio",
      icon: Sparkles,
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
      title: "Label Logs",
      url: "/label-logs",
      icon: Tag,
      pageKey: "labelLogs",
    },
    {
      title: "Data Capture",
      url: "/capture-list",
      icon: Database,
      pageKey: "captureList",
    },
    {
      title: "Booking Scheduler",
      url: "/booking-scheduler",
      icon: Calendar,
      pageKey: "bookingScheduler",
      children: [
        { title: "Services", url: "/booking-scheduler/departments" },
        {
          title: "Bookings",
          url: "/booking-scheduler/bookings",
          children: [
            { title: "List", url: "/booking-scheduler/bookings" },
            { title: "Calendar", url: "/booking-scheduler/calendar" },
          ],
        },
        { title: "Settings", url: "/booking-scheduler/settings" },
      ],
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
  const isImpersonating = (user as any)?.impersonation?.isImpersonating;
  
  const labelManagementAllowed = (user as any)?.labelManagementAllowed;

  const mainItems = allMainItems.filter(item => {
    // Hide Label Logs when label management is not allowed for this user
    if (item.title === "Label Logs" && !labelManagementAllowed) return false;
    // Admins see all pages unless impersonating
    if (user?.role === "admin" && !isImpersonating) return true;
    if (!item.pageKey) return true;
    return effectivePageAccess[item.pageKey] === true;
  });

  const adminItems: NavItem[] = user?.role === "admin" ? [
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
              {mainItems.map((item) => {
                if (item.children) {
                  const isActive =
                    location === item.url || location.startsWith(item.url + "/");
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.title}
                        data-testid={`link-${item.title.toLowerCase()}`}
                        onClick={() => {
                          if (sidebarState === "collapsed") {
                            setLocation(item.children?.[0]?.url ?? item.url);
                          } else {
                            setBookingExpanded((v) => !v);
                          }
                        }}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        <ChevronDown
                          className={`ml-auto h-4 w-4 shrink-0 transition-transform group-data-[collapsible=icon]:hidden ${
                            bookingExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </SidebarMenuButton>
                      {bookingExpanded && (
                        <SidebarMenuSub>
                          {item.children.map((child) => {
                            if (child.children) {
                              const childActive =
                                location === child.url ||
                                location.startsWith(child.url + "/") ||
                                (child.children?.some(
                                  (gc) => location === gc.url || location.startsWith(gc.url + "/"),
                                ) ?? false);
                              return (
                                <SidebarMenuSubItem key={child.url}>
                                  <SidebarMenuSubButton
                                    isActive={childActive}
                                    data-testid={`link-booking-scheduler-${child.title.toLowerCase()}`}
                                    onClick={() => setBookingsExpanded((v) => !v)}
                                  >
                                    <span>{child.title}</span>
                                    <ChevronDown
                                      className={`ml-auto h-4 w-4 shrink-0 transition-transform group-data-[collapsible=icon]:hidden ${
                                        bookingsExpanded ? "rotate-180" : ""
                                      }`}
                                    />
                                  </SidebarMenuSubButton>
                                  {bookingsExpanded && (
                                    <SidebarMenuSub>
                                      {child.children.map((gc) => (
                                        <SidebarMenuSubItem key={gc.url}>
                                          <SidebarMenuSubButton
                                            asChild
                                            isActive={location === gc.url}
                                            data-testid={`link-booking-scheduler-${child.title.toLowerCase()}-${gc.title.toLowerCase()}`}
                                          >
                                            <Link href={gc.url}>
                                              <span>{gc.title}</span>
                                            </Link>
                                          </SidebarMenuSubButton>
                                        </SidebarMenuSubItem>
                                      ))}
                                    </SidebarMenuSub>
                                  )}
                                </SidebarMenuSubItem>
                              );
                            }
                            return (
                              <SidebarMenuSubItem key={child.url}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={location === child.url}
                                  data-testid={`link-booking-scheduler-${child.title.toLowerCase()}`}
                                >
                                  <Link href={child.url}>
                                    <span>{child.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                }
                return (
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
                );
              })}
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
