import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface AdminRouteProps {
  children: React.ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (isLoading) return;
    
    if (!user) {
      setLocation("/login");
      return;
    }

    if (user.role !== "admin") {
      const effectivePageAccess = (user as any)?.effectivePageAccess || {};
      const accessiblePages = Object.entries(effectivePageAccess)
        .filter(([key, value]) => value === true)
        .map(([key]) => key);
      
      const pageMap: Record<string, string> = {
        dashboard: "/dashboard",
        channels: "/channels",
        safetyMeter: "/safety-meter",
        send: "/send",
        templates: "/templates",
        workflows: "/workflows",
        phonebooks: "/phonebooks",
        outbox: "/outbox",
        logs: "/logs",
        bulkLogs: "/bulk-logs",
        pricing: "/pricing",
        settings: "/settings",
      };
      
      const firstAccessiblePage = accessiblePages.length > 0 
        ? pageMap[accessiblePages[0]] || "/pricing"
        : "/pricing";
      
      toast({
        title: "Admin Access Required",
        description: "You don't have permission to access this page.",
        variant: "destructive",
      });
      setLocation(firstAccessiblePage);
    }
  }, [user, isLoading, setLocation, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  return <>{children}</>;
}
