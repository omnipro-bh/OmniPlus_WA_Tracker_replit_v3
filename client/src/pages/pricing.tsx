import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Check, Upload } from "lucide-react";
import type { Plan } from "@shared/schema";
import PayPalSubscribeButton from "@/components/PayPalSubscribeButton";

export default function Pricing() {
  const { toast } = useToast();
  const [durationType, setDurationType] = useState<"MONTHLY" | "SEMI_ANNUAL" | "ANNUAL">("MONTHLY");
  const [isOfflineDialogOpen, setIsOfflineDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [offlinePayment, setOfflinePayment] = useState({
    amount: "",
    currency: "USD",
    reference: "",
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const offlinePaymentMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/subscribe/offline", data);
    },
    onSuccess: () => {
      setIsOfflineDialogOpen(false);
      setOfflinePayment({ amount: "", currency: "USD", reference: "" });
      toast({
        title: "Payment submitted",
        description: "Your payment is pending admin approval.",
      });
    },
  });

  const getDiscountedPrice = (price: number) => {
    if (durationType === "SEMI_ANNUAL") return price * 6 * 0.95;
    if (durationType === "ANNUAL") return price * 12 * 0.9;
    return price;
  };

  const handleOfflinePayment = (plan: Plan) => {
    setSelectedPlan(plan);
    setOfflinePayment({
      ...offlinePayment,
      amount: (getDiscountedPrice(plan.price) / 100).toFixed(2),
      currency: plan.currency,
    });
    setIsOfflineDialogOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">Choose Your Plan</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Flexible pricing that scales with your business. Cancel anytime.
        </p>
      </div>

      {/* Duration Toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-lg border border-border p-1">
          <Button
            variant={durationType === "MONTHLY" ? "default" : "ghost"}
            size="sm"
            onClick={() => setDurationType("MONTHLY")}
            data-testid="button-monthly"
          >
            Monthly
          </Button>
          <Button
            variant={durationType === "SEMI_ANNUAL" ? "default" : "ghost"}
            size="sm"
            onClick={() => setDurationType("SEMI_ANNUAL")}
            data-testid="button-semi-annual"
          >
            Semi-Annual
            <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
              -5%
            </span>
          </Button>
          <Button
            variant={durationType === "ANNUAL" ? "default" : "ghost"}
            size="sm"
            onClick={() => setDurationType("ANNUAL")}
            data-testid="button-annual"
          >
            Annual
            <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
              -10%
            </span>
          </Button>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 max-w-7xl mx-auto">
        {plans.map((plan, index) => {
          const isPopular = index === 1;
          const discountedPrice = getDiscountedPrice(plan.price);
          const features = Array.isArray(plan.features) ? plan.features : [];

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${isPopular ? "border-primary shadow-lg scale-105" : ""}`}
              data-testid={`plan-${plan.name.toLowerCase()}`}
            >
              {isPopular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                    POPULAR
                  </span>
                </div>
              )}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">${(discountedPrice / 100).toFixed(0)}</span>
                  <span className="text-muted-foreground">/
                    {durationType === "MONTHLY" ? "month" : durationType === "SEMI_ANNUAL" ? "6 months" : "year"}
                  </span>
                </div>
                {durationType !== "MONTHLY" && (
                  <div className="text-sm text-muted-foreground line-through">
                    ${(plan.price / 100).toFixed(0)}
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{plan.channelsLimit} WhatsApp Channel{plan.channelsLimit > 1 ? "s" : ""}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{plan.dailyMessagesLimit.toLocaleString()} messages/day</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{plan.bulkMessagesLimit.toLocaleString()} bulk messages</span>
                  </li>
                  {features.map((feature: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                <PayPalSubscribeButton
                  planId={plan.id}
                  planName={plan.name}
                  amount={(discountedPrice / 100).toFixed(2)}
                  currency={plan.currency}
                  durationType={durationType}
                  isPopular={isPopular}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleOfflinePayment(plan)}
                  data-testid={`button-offline-${plan.name.toLowerCase()}`}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Offline Payment
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Offline Payment Dialog */}
      <Dialog open={isOfflineDialogOpen} onOpenChange={setIsOfflineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Offline Payment</DialogTitle>
            <DialogDescription>
              Submit proof of payment for manual verification
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <div className="flex gap-2">
                <Input
                  id="amount"
                  type="number"
                  value={offlinePayment.amount}
                  onChange={(e) => setOfflinePayment({ ...offlinePayment, amount: e.target.value })}
                  data-testid="input-amount"
                />
                <Input
                  value={offlinePayment.currency}
                  onChange={(e) => setOfflinePayment({ ...offlinePayment, currency: e.target.value })}
                  className="w-24"
                  data-testid="input-currency"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference">Payment Reference</Label>
              <Input
                id="reference"
                placeholder="Transaction ID or reference number"
                value={offlinePayment.reference}
                onChange={(e) => setOfflinePayment({ ...offlinePayment, reference: e.target.value })}
                data-testid="input-reference"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proof">Upload Proof (Optional)</Label>
              <Input id="proof" type="file" accept="image/*,.pdf" data-testid="input-proof" />
              <p className="text-xs text-muted-foreground">
                Screenshot of payment confirmation or receipt
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOfflineDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedPlan) {
                  offlinePaymentMutation.mutate({
                    planId: selectedPlan.id,
                    amount: Math.round(parseFloat(offlinePayment.amount) * 100),
                    currency: offlinePayment.currency,
                    reference: offlinePayment.reference,
                  });
                }
              }}
              disabled={!offlinePayment.amount || offlinePaymentMutation.isPending}
              data-testid="button-submit-offline-payment"
            >
              Submit Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
