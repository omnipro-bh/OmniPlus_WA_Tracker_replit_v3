import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Radio, Calendar, CreditCard, Send, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Job } from "@shared/schema";
import { StatusBadge } from "@/components/status-badge";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { user } = useAuth();

  const { data: recentJobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
    enabled: !!user,
  });

  const hasActivePlan = user?.currentSubscription?.status === "ACTIVE";
  const daysRemaining = user?.daysBalance || 0;
  const isExpired = user?.status === "expired";

  return (
    <div className="space-y-8">
      {/* Banner for no active plan */}
      {!hasActivePlan && (
        <div
          className="rounded-lg border-l-4 border-warning bg-warning/10 px-6 py-4"
          data-testid="banner-no-plan"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-warning">No Active Plan</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Please subscribe to a plan to activate your account and start adding channels.
              </p>
              <Link href="/pricing">
                <Button className="mt-3" size="sm" data-testid="button-view-pricing">
                  View Pricing Plans
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Expired/Low Balance Banner */}
      {isExpired && (
        <div
          className="rounded-lg border-l-4 border-error bg-error/10 px-6 py-4"
          data-testid="banner-expired"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-error mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-error">Account Expired</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Your days balance has run out. All channels have been paused. Please contact admin
                to add more days or upgrade your plan.
              </p>
              <Link href="/pricing">
                <Button variant="destructive" className="mt-3" size="sm">
                  Renew Subscription
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Channels Used</CardTitle>
            <Radio className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-channels-used">
              {user?.channelsUsed || 0} / {user?.channelsLimit || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {user?.channelsLimit ? Math.max(0, (user.channelsLimit - (user.channelsUsed || 0))) : 0} slots
              available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Days Remaining</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold ${daysRemaining > 7 ? "text-success" : daysRemaining > 0 ? "text-warning" : "text-error"}`}
              data-testid="text-days-remaining"
            >
              {daysRemaining}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {daysRemaining > 0 ? "Days of service" : "Renewal required"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-current-plan">
              {user?.currentPlan?.name || "None"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {hasActivePlan ? "Active subscription" : "No active plan"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages Today</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-messages-today">
              {user?.messagesSentToday || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {user?.currentPlan?.dailyMessagesLimit
                ? `${user.currentPlan.dailyMessagesLimit - (user.messagesSentToday || 0)} left today`
                : "No limit set"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest messaging jobs</CardDescription>
        </CardHeader>
        <CardContent>
          {recentJobs.length === 0 ? (
            <div className="text-center py-12">
              <Send className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No messages sent yet</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Start sending messages to see your activity here
              </p>
              <Link href="/send">
                <Button className="mt-4" data-testid="button-send-first-message">
                  Send First Message
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {recentJobs.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between rounded-lg border border-border p-4 hover-elevate"
                  data-testid={`job-${job.id}`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-muted-foreground">
                        #{job.id}
                      </span>
                      <StatusBadge status={job.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <div className="text-lg font-bold">{job.sent}</div>
                      <div className="text-xs text-muted-foreground">Sent</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">{job.delivered}</div>
                      <div className="text-xs text-muted-foreground">Delivered</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-error">{job.failed}</div>
                      <div className="text-xs text-muted-foreground">Failed</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
