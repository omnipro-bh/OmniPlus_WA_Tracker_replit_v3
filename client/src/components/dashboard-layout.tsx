import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { LogOut, AlertCircle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { is } from "drizzle-orm";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  // Redirect to login if not authenticated
  useEffect(() => {
    if(isLoading) return;
    if (!user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout", {});
      toast({ title: "Logged out successfully" });
      setLocation("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleExitImpersonation = async () => {
    try {
      await apiRequest("POST", "/api/admin/exit-impersonation");
      toast({
        title: "Returned to admin account",
        description: "You have exited impersonation mode",
      });
      window.location.href = "/admin";
    } catch (error: any) {
      toast({
        title: "Failed to exit impersonation",
        description: error.error || "Could not exit impersonation mode",
        variant: "destructive",
      });
    }
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  const impersonation = (user as any).impersonation;

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </header>
          {impersonation?.isImpersonating && (
            <Alert 
              className="rounded-none border-0 border-b bg-amber-500/15 border-amber-500/50 text-amber-900 dark:text-amber-100"
              data-testid="impersonation-banner"
            >
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="flex items-center justify-between w-full gap-4">
                <span className="text-sm font-medium">
                  You are viewing as <span className="font-bold">{user.name || user.email}</span>
                  {impersonation.originalAdminName && (
                    <span className="text-xs ml-2 opacity-80">
                      (Admin: {impersonation.originalAdminName})
                    </span>
                  )}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExitImpersonation}
                  className="h-7 text-xs bg-background/50 hover:bg-background border-amber-600/30 dark:border-amber-400/30"
                  data-testid="button-exit-impersonation"
                >
                  <X className="h-3 w-3 mr-1" />
                  Exit Impersonation
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
