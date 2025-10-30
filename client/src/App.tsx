import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { DashboardLayout } from "@/components/dashboard-layout";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import Dashboard from "@/pages/dashboard";
import Channels from "@/pages/channels";
import Send from "@/pages/send";
import Bulk from "@/pages/bulk";
import Templates from "@/pages/templates";
import Workflows from "@/pages/workflows";
import Outbox from "@/pages/outbox";
import Logs from "@/pages/logs";
import Pricing from "@/pages/pricing";
import Admin from "@/pages/admin";
import AdminBalances from "@/pages/admin-balances";
import WHAPISettings from "@/pages/whapi-settings";

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />

      {/* Protected routes */}
      <Route path="/dashboard">
        <DashboardLayout>
          <Dashboard />
        </DashboardLayout>
      </Route>
      <Route path="/channels">
        <DashboardLayout>
          <Channels />
        </DashboardLayout>
      </Route>
      <Route path="/send">
        <DashboardLayout>
          <Send />
        </DashboardLayout>
      </Route>
      <Route path="/bulk">
        <DashboardLayout>
          <Bulk />
        </DashboardLayout>
      </Route>
      <Route path="/templates">
        <DashboardLayout>
          <Templates />
        </DashboardLayout>
      </Route>
      <Route path="/workflows">
        <DashboardLayout>
          <Workflows />
        </DashboardLayout>
      </Route>
      <Route path="/outbox">
        <DashboardLayout>
          <Outbox />
        </DashboardLayout>
      </Route>
      <Route path="/logs">
        <DashboardLayout>
          <Logs />
        </DashboardLayout>
      </Route>
      <Route path="/pricing">
        <DashboardLayout>
          <Pricing />
        </DashboardLayout>
      </Route>
      <Route path="/admin">
        <DashboardLayout>
          <Admin />
        </DashboardLayout>
      </Route>
      <Route path="/admin/balances">
        <DashboardLayout>
          <AdminBalances />
        </DashboardLayout>
      </Route>
      <Route path="/admin/whapi-settings">
        <DashboardLayout>
          <WHAPISettings />
        </DashboardLayout>
      </Route>

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <AuthProvider>
            <Router />
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
