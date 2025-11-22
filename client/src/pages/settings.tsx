import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useEffectiveUser } from "@/hooks/use-effective-user";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Lock, XCircle, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";

export default function Settings() {
  const { toast } = useToast();
  const { user } = useEffectiveUser();
  const [passwords, setPasswords] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { newPassword: string }) => {
      return await apiRequest("POST", "/api/me/reset-password", data);
    },
    onSuccess: () => {
      setPasswords({ newPassword: "", confirmPassword: "" });
      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update password",
        description: error.error || "Could not update password",
        variant: "destructive",
      });
    },
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/me/cancel-subscription", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      toast({
        title: "Subscription cancelled",
        description: "Your subscription has been cancelled. You'll have access until the end of your billing period.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to cancel subscription",
        description: error.error || "Could not cancel subscription",
        variant: "destructive",
      });
    },
  });

  // Fetch user's channels to get actual expiration date
  const { data: channels = [] } = useQuery<Array<{ id: number; expiresAt: string | null; status: string }>>({
    queryKey: ["/api/channels"],
  });

  // Find the channel with the latest expiration date
  const latestExpirationDate = channels
    .filter((channel) => channel.status === "ACTIVE" && channel.expiresAt)
    .map((channel) => new Date(channel.expiresAt!))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are identical",
        variant: "destructive",
      });
      return;
    }

    if (passwords.newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters long",
        variant: "destructive",
      });
      return;
    }

    resetPasswordMutation.mutate({ newPassword: passwords.newPassword });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account settings and preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                placeholder="Enter new password"
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwords.confirmPassword}
                onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                placeholder="Confirm new password"
                data-testid="input-confirm-password"
              />
            </div>
            <Button
              type="submit"
              disabled={resetPasswordMutation.isPending}
              data-testid="button-reset-password"
            >
              {resetPasswordMutation.isPending ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {user?.currentSubscription?.status === "ACTIVE" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Cancel Subscription
            </CardTitle>
            <CardDescription>
              Cancel your current subscription plan
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You are currently subscribed to the <span className="font-semibold">{user.currentPlan?.name}</span> plan.
              </p>
              
              {typeof user.daysBalance === 'number' && user.daysBalance >= 0 && (
                <div className="flex flex-wrap items-center gap-6 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Days Remaining</p>
                      <p className="text-lg font-semibold" data-testid="text-days-remaining">
                        {user.daysBalance} days
                      </p>
                    </div>
                  </div>
                  
                  {latestExpirationDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Expires On</p>
                        <p className="text-lg font-semibold" data-testid="text-expiration-date">
                          {format(latestExpirationDate, "MMM dd, yyyy")}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                Canceling will stop future billing (both PayPal and offline payments), but you'll retain access until the end of your current billing period.
              </p>
            </div>
            
            <Button
              variant="destructive"
              onClick={() => setIsCancelDialogOpen(true)}
              data-testid="button-cancel-subscription"
            >
              Cancel Subscription
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel your subscription? You'll continue to have access until the end of your current billing period, but you won't be charged again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-dialog-cancel">
              Keep Subscription
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                cancelSubscriptionMutation.mutate();
                setIsCancelDialogOpen(false);
              }}
              data-testid="button-cancel-dialog-confirm"
              className="bg-destructive text-destructive-foreground hover-elevate"
            >
              Yes, Cancel Subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
