import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ProtectedRoute } from "@/components/protected-route";
import { AdminRoute } from "@/components/admin-route";
import { ChatWidget } from "@/components/chat-widget";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import PrivacyPolicy from "@/pages/privacy-policy";
import TermsConditions from "@/pages/terms-conditions";
import ButtonTerms from "@/pages/button-terms";
import About from "@/pages/about";
import Dashboard from "@/pages/dashboard";
import Channels from "@/pages/channels";
import Send from "@/pages/send";
import Templates from "@/pages/templates";
import Workflows from "@/pages/workflows";
import CaptureList from "@/pages/capture-list";
import BookingScheduler from "@/pages/booking-scheduler";
import Phonebooks from "@/pages/phonebooks";
import PhonebookDetail from "@/pages/phonebook-detail";
import Subscribers from "@/pages/subscribers";
import Outbox from "@/pages/outbox";
import Logs from "@/pages/logs";
import BulkLogs from "@/pages/bulk-logs";
import Pricing from "@/pages/pricing";
import Admin from "@/pages/admin";
import AdminBalances from "@/pages/admin-balances";
import WHAPISettings from "@/pages/whapi-settings";
import Settings from "@/pages/settings";
import SafetyMeter from "@/pages/safety-meter";

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-conditions" component={TermsConditions} />
      <Route path="/button-terms" component={ButtonTerms} />
      <Route path="/about" component={About} />

      {/* Protected routes */}
      <Route path="/dashboard">
        <DashboardLayout>
          <ProtectedRoute requiredKey="dashboard">
            <Dashboard />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/channels">
        <DashboardLayout>
          <ProtectedRoute requiredKey="channels">
            <Channels />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/safety-meter">
        <DashboardLayout>
          <ProtectedRoute requiredKey="safetyMeter">
            <SafetyMeter />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/send">
        <DashboardLayout>
          <ProtectedRoute requiredKey="send">
            <Send />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/templates">
        <DashboardLayout>
          <ProtectedRoute requiredKey="templates">
            <Templates />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/workflows">
        <DashboardLayout>
          <ProtectedRoute requiredKey="workflows">
            <Workflows />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/capture-list">
        <DashboardLayout>
          <ProtectedRoute requiredKey="captureList">
            <CaptureList />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/booking-scheduler">
        <DashboardLayout>
          <ProtectedRoute requiredKey="bookingScheduler">
            <BookingScheduler />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/phonebooks">
        <DashboardLayout>
          <ProtectedRoute requiredKey="phonebooks">
            <Phonebooks />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/phonebooks/:id">
        <DashboardLayout>
          <ProtectedRoute requiredKey="phonebooks">
            <PhonebookDetail />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/subscribers">
        <DashboardLayout>
          <ProtectedRoute requiredKey="subscribers">
            <Subscribers />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/outbox">
        <DashboardLayout>
          <ProtectedRoute requiredKey="outbox">
            <Outbox />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/logs">
        <DashboardLayout>
          <ProtectedRoute requiredKey="logs">
            <Logs />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/bulk-logs">
        <DashboardLayout>
          <ProtectedRoute requiredKey="bulkLogs">
            <BulkLogs />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/pricing">
        <DashboardLayout>
          <ProtectedRoute requiredKey="pricing">
            <Pricing />
          </ProtectedRoute>
        </DashboardLayout>
      </Route>
      <Route path="/admin">
        <DashboardLayout>
          <AdminRoute>
            <Admin />
          </AdminRoute>
        </DashboardLayout>
      </Route>
      <Route path="/admin/balances">
        <DashboardLayout>
          <AdminRoute>
            <AdminBalances />
          </AdminRoute>
        </DashboardLayout>
      </Route>
      <Route path="/admin/whapi-settings">
        <DashboardLayout>
          <AdminRoute>
            <WHAPISettings />
          </AdminRoute>
        </DashboardLayout>
      </Route>
      <Route path="/settings">
        <DashboardLayout>
          <ProtectedRoute requiredKey="settings">
            <Settings />
          </ProtectedRoute>
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
            <ChatWidget />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
