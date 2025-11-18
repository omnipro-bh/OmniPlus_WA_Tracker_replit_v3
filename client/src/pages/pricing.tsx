import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Check, Upload, MessageSquare, Calendar, FileText, Gift } from "lucide-react";
import type { Plan } from "@shared/schema";
import PayPalSubscribeButton from "@/components/PayPalSubscribeButton";

// Helper function to get currency symbol
const getCurrencySymbol = (currency: string) => {
  const symbols: Record<string, string> = {
    USD: "$",
    BHD: "BD",
    EUR: "€",
    GBP: "£",
    SAR: "SR",
    AED: "AED",
    KWD: "KD",
    OMR: "OMR",
    QAR: "QR",
  };
  return symbols[currency] || currency;
};

export default function Pricing() {
  const { toast } = useToast();
  const [durationType, setDurationType] = useState<"MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL">("MONTHLY");
  const [isOfflineDialogOpen, setIsOfflineDialogOpen] = useState(false);
  const [isQuoteDialogOpen, setIsQuoteDialogOpen] = useState(false);
  const [isDemoDialogOpen, setIsDemoDialogOpen] = useState(false);
  const [isTermsDialogOpen, setIsTermsDialogOpen] = useState(false);
  const [isPayPalTermsDialogOpen, setIsPayPalTermsDialogOpen] = useState(false);
  const [offlineTermsAccepted, setOfflineTermsAccepted] = useState(false);
  const [paypalTermsAccepted, setPayPalTermsAccepted] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [offlinePayment, setOfflinePayment] = useState({
    amount: "",
    currency: "USD",
    reference: "",
    proofUrl: "",
    couponCode: "",
  });
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPercent: number } | null>(null);
  const [quoteRequest, setQuoteRequest] = useState({
    name: "",
    businessEmail: "",
    phone: "",
    message: "",
  });
  const [demoRequest, setDemoRequest] = useState({
    name: "",
    businessEmail: "",
    phone: "",
    message: "",
    requestedDate: "",
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const { data: termsDocuments = [] } = useQuery<any[]>({
    queryKey: ["/api/terms"],
  });

  // Calculate which billing periods are enabled across all plans (union)
  const enabledPeriods = new Set<string>();
  plans.forEach((plan) => {
    const planPeriods = (plan as any).enabledBillingPeriods || ["MONTHLY", "SEMI_ANNUAL", "ANNUAL"];
    planPeriods.forEach((period: string) => enabledPeriods.add(period));
  });

  const validateCouponMutation = useMutation({
    mutationFn: async (data: { code: string; planId: number }) => {
      const response = await apiRequest("POST", "/api/coupons/validate", data);
      return await response.json();
    },
    onSuccess: (data: any) => {
      if (data.valid && data.coupon) {
        setAppliedCoupon({
          code: data.coupon.code,
          discountPercent: data.coupon.discountPercent,
        });
        toast({
          title: "Coupon applied",
          description: `${data.coupon.discountPercent}% discount applied!`,
        });
      } else {
        toast({
          title: "Invalid coupon",
          description: data.message || "Coupon is not valid",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Validation failed",
        description: error.error || "Failed to validate coupon",
        variant: "destructive",
      });
    },
  });

  const offlinePaymentMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!offlineTermsAccepted) {
        throw new Error("Please accept the terms and conditions");
      }
      const mainTerms = termsDocuments.find((t: any) => t.type === "MAIN" && t.isActive);
      return await apiRequest("POST", "/api/subscribe/offline", {
        ...data,
        termsVersion: mainTerms?.version || "1.0",
        couponCode: appliedCoupon?.code || undefined,
      });
    },
    onSuccess: () => {
      setIsOfflineDialogOpen(false);
      setOfflinePayment({ amount: "", currency: "USD", reference: "", proofUrl: "", couponCode: "" });
      setAppliedCoupon(null);
      setOfflineTermsAccepted(false);
      toast({
        title: "Payment submitted",
        description: "Your payment is pending admin approval.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Submission failed",
        description: error.error || "Failed to submit payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const quoteRequestMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/plan-requests", data);
    },
    onSuccess: () => {
      setIsQuoteDialogOpen(false);
      setQuoteRequest({ name: "", businessEmail: "", phone: "", message: "" });
      toast({
        title: "Quote request submitted",
        description: "We'll get back to you with a custom quote shortly.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Submission failed",
        description: error.error || "Failed to submit request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const demoRequestMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/plan-requests", data);
    },
    onSuccess: () => {
      setIsDemoDialogOpen(false);
      setDemoRequest({ name: "", businessEmail: "", phone: "", message: "", requestedDate: "" });
      toast({
        title: "Demo request submitted",
        description: "We'll contact you to schedule your demo.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Submission failed",
        description: error.error || "Failed to submit request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getDiscountedPrice = (price: number, plan: Plan) => {
    const planData = plan as any; // Type cast to access new fields
    if (durationType === "QUARTERLY") {
      const discount = 1 - ((planData.quarterlyDiscountPercent || 0) / 100);
      return price * 3 * discount;
    }
    if (durationType === "SEMI_ANNUAL") {
      const discount = 1 - ((planData.semiAnnualDiscountPercent || 5) / 100);
      return price * 6 * discount;
    }
    if (durationType === "ANNUAL") {
      const discount = 1 - ((planData.annualDiscountPercent || 10) / 100);
      return price * 12 * discount;
    }
    return price;
  };

  const handleOfflinePayment = (plan: Plan) => {
    setSelectedPlan(plan);
    // Always use PayPal price for actual payment, even if display price is different
    setOfflinePayment({
      ...offlinePayment,
      amount: (getDiscountedPrice(plan.price || 0, plan) / 100).toFixed(2),
      currency: plan.currency, // Always USD for PayPal
      couponCode: "",
    });
    setAppliedCoupon(null);
    setOfflineTermsAccepted(false);
    setIsOfflineDialogOpen(true);
  };

  const handleFreeTrial = async (plan: Plan) => {
    try {
      // Get the latest terms version
      const termsResponse = await fetch("/api/terms");
      const terms = await termsResponse.json();
      const latestTermsVersion = Math.max(...terms.map((t: any) => t.version));

      // Create a free trial request (similar to offline payment but with type FREE_TRIAL)
      await apiRequest("POST", "/api/subscribe/offline", {
        planId: plan.id,
        type: "FREE_TRIAL",
        requestType: "PAID",
        amount: 0, // Free trial has no cost
        currency: plan.currency,
        reference: `Free Trial - ${(plan as any).freeTrialDays || 7} days`,
        proofUrl: null,
        termsVersion: latestTermsVersion,
      });
      
      toast({
        title: "Free trial request submitted",
        description: `Your ${(plan as any).freeTrialDays || 7}-day free trial request has been submitted. Please wait for admin approval.`,
      });
      
      // Refresh both user and admin offline payments
      await queryClient.invalidateQueries({ queryKey: ["/api/offline-payments"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/offline-payments"] });
    } catch (error: any) {
      toast({
        title: "Request failed",
        description: error.message || "Failed to submit free trial request",
        variant: "destructive",
      });
    }
  };

  const handlePayPalClick = (plan: Plan) => {
    setSelectedPlan(plan);
    setPayPalTermsAccepted(false);
    setIsPayPalTermsDialogOpen(true);
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
          {enabledPeriods.has("MONTHLY") && (
            <Button
              variant={durationType === "MONTHLY" ? "default" : "ghost"}
              size="sm"
              onClick={() => setDurationType("MONTHLY")}
              data-testid="button-monthly"
            >
              Monthly
            </Button>
          )}
          {enabledPeriods.has("QUARTERLY") && (
            <Button
              variant={durationType === "QUARTERLY" ? "default" : "ghost"}
              size="sm"
              onClick={() => setDurationType("QUARTERLY")}
              data-testid="button-quarterly"
            >
              Quarterly
            </Button>
          )}
          {enabledPeriods.has("SEMI_ANNUAL") && (
            <Button
              variant={durationType === "SEMI_ANNUAL" ? "default" : "ghost"}
              size="sm"
              onClick={() => setDurationType("SEMI_ANNUAL")}
              data-testid="button-semi-annual"
            >
              Semi-Annual
            </Button>
          )}
          {enabledPeriods.has("ANNUAL") && (
            <Button
              variant={durationType === "ANNUAL" ? "default" : "ghost"}
              size="sm"
              onClick={() => setDurationType("ANNUAL")}
              data-testid="button-annual"
            >
              Annual
            </Button>
          )}
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 max-w-7xl mx-auto">
        {plans.filter(plan => plan.published).sort((a, b) => a.sortOrder - b.sortOrder).map((plan, index) => {
          const isPopular = (plan as any).isPopular || false;
          // Use display price if available, otherwise use PayPal price
          const displayPrice = (plan as any).displayPrice || plan.price || 0;
          const displayCurrency = (plan as any).displayCurrency || plan.currency;
          const discountedPrice = getDiscountedPrice(displayPrice, plan);
          const features = Array.isArray(plan.features) ? plan.features : [];
          
          // Check if this plan supports the currently selected billing period
          const planEnabledPeriods = (plan as any).enabledBillingPeriods || ["MONTHLY", "SEMI_ANNUAL", "ANNUAL"];
          const isPeriodAvailable = planEnabledPeriods.includes(durationType);

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
                  {plan.requestType === "PAID" && (displayPrice > 0) ? (
                    <>
                      <span className="text-4xl font-bold">{getCurrencySymbol(displayCurrency)}{(discountedPrice / 100).toFixed(0)}</span>
                      <span className="text-muted-foreground">/
                        {durationType === "MONTHLY" ? "month" : durationType === "QUARTERLY" ? "3 months" : durationType === "SEMI_ANNUAL" ? "6 months" : "year"}
                      </span>
                      {durationType !== "MONTHLY" && (
                        <div className="text-sm text-muted-foreground line-through">
                          {getCurrencySymbol(displayCurrency)}{(displayPrice / 100).toFixed(0)}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-2xl font-semibold text-muted-foreground">
                      {plan.requestType === "REQUEST_QUOTE" && "Custom Pricing"}
                      {plan.requestType === "BOOK_DEMO" && "Contact Us"}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {/* Only show enabled limits (not -1) */}
                  {plan.channelsLimit !== -1 && (
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <span className="text-sm">
                        {plan.channelsLimit === -1 ? "Unlimited" : plan.channelsLimit} WhatsApp Channel{plan.channelsLimit > 1 ? "s" : ""}
                      </span>
                    </li>
                  )}
                  {plan.dailyMessagesLimit !== -1 && (
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <span className="text-sm">
                        {plan.dailyMessagesLimit === -1 ? "Unlimited" : plan.dailyMessagesLimit.toLocaleString()} messages/day
                      </span>
                    </li>
                  )}
                  {plan.bulkMessagesLimit !== -1 && (
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <span className="text-sm">
                        {plan.bulkMessagesLimit === -1 ? "Unlimited" : plan.bulkMessagesLimit.toLocaleString()} bulk messages
                      </span>
                    </li>
                  )}
                  {(plan as any).chatbotsLimit !== undefined && (plan as any).chatbotsLimit !== -1 && (
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <span className="text-sm">
                        {(plan as any).chatbotsLimit === -1 ? "Unlimited" : (plan as any).chatbotsLimit} workflow{(plan as any).chatbotsLimit > 1 ? "s" : ""}
                      </span>
                    </li>
                  )}
                  {(plan as any).phonebookLimit !== undefined && (plan as any).phonebookLimit !== -1 && (
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <span className="text-sm">
                        {(plan as any).phonebookLimit === -1 ? "Unlimited" : (plan as any).phonebookLimit} contact{(plan as any).phonebookLimit > 1 ? "s" : ""} per phonebook
                      </span>
                    </li>
                  )}
                  {features.map((feature: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                {plan.requestType === "PAID" && (
                  <>
                    {isPeriodAvailable ? (
                      <>
                        {/* Only show PayPal button if PayPal is enabled for this plan */}
                        {Array.isArray((plan as any).paymentMethods) && (plan as any).paymentMethods.includes("paypal") && (
                          <Button
                            variant={isPopular ? "default" : "outline"}
                            className="w-full"
                            onClick={() => handlePayPalClick(plan)}
                            data-testid={`button-subscribe-${plan.name.toLowerCase()}`}
                          >
                            Subscribe with PayPal
                          </Button>
                        )}
                        {/* Only show Offline Payment button if offline is enabled for this plan */}
                        {Array.isArray((plan as any).paymentMethods) && (plan as any).paymentMethods.includes("offline") && (
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => handleOfflinePayment(plan)}
                            data-testid={`button-offline-${plan.name.toLowerCase()}`}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Offline Payment
                          </Button>
                        )}
                        {/* Only show Free Trial button if free trial is enabled for this plan */}
                        {(plan as any).freeTrialEnabled && (
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => handleFreeTrial(plan)}
                            data-testid={`button-freetrial-${plan.name.toLowerCase()}`}
                          >
                            <Gift className="h-4 w-4 mr-2" />
                            Free Trial ({(plan as any).freeTrialDays || 7} days)
                          </Button>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-center text-muted-foreground py-2">
                        Not available for {durationType === "MONTHLY" ? "monthly" : durationType === "QUARTERLY" ? "quarterly" : durationType === "SEMI_ANNUAL" ? "semi-annual" : "annual"} billing
                      </div>
                    )}
                  </>
                )}
                {plan.requestType === "REQUEST_QUOTE" && (
                  <Button
                    variant={isPopular ? "default" : "outline"}
                    className="w-full"
                    onClick={() => {
                      setSelectedPlan(plan);
                      setIsQuoteDialogOpen(true);
                    }}
                    data-testid={`button-quote-${plan.name.toLowerCase()}`}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Request Quote
                  </Button>
                )}
                {plan.requestType === "BOOK_DEMO" && (
                  <Button
                    variant={isPopular ? "default" : "outline"}
                    className="w-full"
                    onClick={() => {
                      setSelectedPlan(plan);
                      setIsDemoDialogOpen(true);
                    }}
                    data-testid={`button-demo-${plan.name.toLowerCase()}`}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Book Demo
                  </Button>
                )}
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
              <Label htmlFor="coupon">Coupon Code (Optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="coupon"
                  placeholder="Enter coupon code"
                  value={offlinePayment.couponCode}
                  onChange={(e) => setOfflinePayment({ ...offlinePayment, couponCode: e.target.value.toUpperCase() })}
                  disabled={!!appliedCoupon}
                  data-testid="input-coupon"
                />
                <Button
                  type="button"
                  variant={appliedCoupon ? "outline" : "default"}
                  onClick={() => {
                    if (appliedCoupon) {
                      setAppliedCoupon(null);
                      setOfflinePayment({ ...offlinePayment, couponCode: "" });
                    } else if (offlinePayment.couponCode && selectedPlan) {
                      validateCouponMutation.mutate({
                        code: offlinePayment.couponCode,
                        planId: selectedPlan.id,
                      });
                    }
                  }}
                  disabled={!offlinePayment.couponCode && !appliedCoupon || validateCouponMutation.isPending}
                  data-testid="button-apply-coupon"
                >
                  {appliedCoupon ? "Remove" : "Apply"}
                </Button>
              </div>
              {appliedCoupon && (
                <p className="text-xs text-success">
                  ✓ {appliedCoupon.discountPercent}% discount applied
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              {appliedCoupon && (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Original Price:</span>
                    <span>{getCurrencySymbol(offlinePayment.currency)}{offlinePayment.amount}</span>
                  </div>
                  <div className="flex justify-between text-success">
                    <span>Discount ({appliedCoupon.discountPercent}%):</span>
                    <span>-{getCurrencySymbol(offlinePayment.currency)}{(parseFloat(offlinePayment.amount) * appliedCoupon.discountPercent / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Final Amount:</span>
                    <span>{getCurrencySymbol(offlinePayment.currency)}{(parseFloat(offlinePayment.amount) * (100 - appliedCoupon.discountPercent) / 100).toFixed(2)}</span>
                  </div>
                </div>
              )}
              {!appliedCoupon && (
                <div className="flex gap-2">
                  <Input
                    id="amount"
                    type="text"
                    value={offlinePayment.amount}
                    readOnly
                    className="bg-muted"
                    data-testid="input-amount"
                  />
                  <Input
                    value={offlinePayment.currency}
                    readOnly
                    className="w-24 bg-muted"
                    data-testid="input-currency"
                  />
                </div>
              )}
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
              <Input 
                id="proof" 
                type="file" 
                accept="image/*,.pdf" 
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    // Check file size (5MB limit)
                    if (file.size > 5 * 1024 * 1024) {
                      toast({
                        title: "File too large",
                        description: "Please upload a file smaller than 5MB",
                        variant: "destructive",
                      });
                      e.target.value = ""; // Clear the input
                      return;
                    }
                    // Convert file to base64
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      // Use functional state update to prevent overwriting other fields
                      setOfflinePayment(prev => ({ ...prev, proofUrl: reader.result as string }));
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                data-testid="input-proof" 
              />
              <p className="text-xs text-muted-foreground">
                Screenshot of payment confirmation or receipt
              </p>
            </div>
            <div className="flex items-start space-x-2">
              <Checkbox
                id="offline-terms"
                checked={offlineTermsAccepted}
                onCheckedChange={(checked) => setOfflineTermsAccepted(checked as boolean)}
                data-testid="checkbox-offline-terms"
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="offline-terms"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  I accept the{" "}
                  <button
                    className="text-sm text-primary underline hover:no-underline"
                    onClick={() => setIsTermsDialogOpen(true)}
                    type="button"
                    data-testid="button-view-terms-offline"
                  >
                    Terms & Conditions
                  </button>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOfflineDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedPlan) {
                  const originalAmount = parseFloat(offlinePayment.amount);
                  const finalAmount = appliedCoupon 
                    ? originalAmount * (100 - appliedCoupon.discountPercent) / 100
                    : originalAmount;
                  
                  offlinePaymentMutation.mutate({
                    planId: selectedPlan.id,
                    amount: Math.round(finalAmount * 100),
                    currency: offlinePayment.currency,
                    reference: offlinePayment.reference,
                    proofUrl: offlinePayment.proofUrl || undefined,
                    durationType: durationType, // Include duration type for backend validation
                  });
                }
              }}
              disabled={!offlinePayment.amount || !offlineTermsAccepted || offlinePaymentMutation.isPending}
              data-testid="button-submit-offline-payment"
            >
              Submit Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quote Request Dialog */}
      <Dialog open={isQuoteDialogOpen} onOpenChange={setIsQuoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a Custom Quote</DialogTitle>
            <DialogDescription>
              Tell us about your needs and we'll provide a tailored quote for {selectedPlan?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="quote-name">Full Name *</Label>
              <Input
                id="quote-name"
                placeholder="John Doe"
                value={quoteRequest.name}
                onChange={(e) => setQuoteRequest({ ...quoteRequest, name: e.target.value })}
                data-testid="input-quote-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-email">Business Email *</Label>
              <Input
                id="quote-email"
                type="email"
                placeholder="john@company.com"
                value={quoteRequest.businessEmail}
                onChange={(e) => setQuoteRequest({ ...quoteRequest, businessEmail: e.target.value })}
                data-testid="input-quote-email"
              />
              <p className="text-xs text-muted-foreground">Please use a business email (not Gmail, Yahoo, Hotmail, etc.)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-phone">Phone Number *</Label>
              <Input
                id="quote-phone"
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={quoteRequest.phone}
                onChange={(e) => setQuoteRequest({ ...quoteRequest, phone: e.target.value })}
                data-testid="input-quote-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-message">Tell us about your requirements *</Label>
              <Textarea
                id="quote-message"
                placeholder="Describe your business needs, expected message volume, number of channels, etc."
                rows={4}
                value={quoteRequest.message}
                onChange={(e) => setQuoteRequest({ ...quoteRequest, message: e.target.value })}
                data-testid="textarea-quote-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQuoteDialogOpen(false)} data-testid="button-cancel-quote">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedPlan) {
                  quoteRequestMutation.mutate({
                    planId: selectedPlan.id,
                    name: quoteRequest.name,
                    phone: quoteRequest.phone,
                    businessEmail: quoteRequest.businessEmail,
                    message: quoteRequest.message,
                  });
                }
              }}
              disabled={!quoteRequest.name || !quoteRequest.businessEmail || !quoteRequest.phone || !quoteRequest.message || quoteRequestMutation.isPending}
              data-testid="button-submit-quote"
            >
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Demo Booking Dialog */}
      <Dialog open={isDemoDialogOpen} onOpenChange={setIsDemoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Book a Demo</DialogTitle>
            <DialogDescription>
              Schedule a personalized demo of {selectedPlan?.name} with our team
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="demo-name">Full Name *</Label>
              <Input
                id="demo-name"
                placeholder="John Doe"
                value={demoRequest.name}
                onChange={(e) => setDemoRequest({ ...demoRequest, name: e.target.value })}
                data-testid="input-demo-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-email">Business Email *</Label>
              <Input
                id="demo-email"
                type="email"
                placeholder="john@company.com"
                value={demoRequest.businessEmail}
                onChange={(e) => setDemoRequest({ ...demoRequest, businessEmail: e.target.value })}
                data-testid="input-demo-email"
              />
              <p className="text-xs text-muted-foreground">Please use a business email (not Gmail, Yahoo, Hotmail, etc.)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-phone">Phone Number *</Label>
              <Input
                id="demo-phone"
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={demoRequest.phone}
                onChange={(e) => setDemoRequest({ ...demoRequest, phone: e.target.value })}
                data-testid="input-demo-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-date">Preferred Date *</Label>
              <Input
                id="demo-date"
                type="date"
                value={demoRequest.requestedDate}
                onChange={(e) => setDemoRequest({ ...demoRequest, requestedDate: e.target.value })}
                data-testid="input-demo-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-message">Tell us about your goals *</Label>
              <Textarea
                id="demo-message"
                placeholder="What would you like to see in the demo? Any specific features or use cases?"
                rows={3}
                value={demoRequest.message}
                onChange={(e) => setDemoRequest({ ...demoRequest, message: e.target.value })}
                data-testid="textarea-demo-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDemoDialogOpen(false)} data-testid="button-cancel-demo">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedPlan) {
                  demoRequestMutation.mutate({
                    planId: selectedPlan.id,
                    name: demoRequest.name,
                    phone: demoRequest.phone,
                    businessEmail: demoRequest.businessEmail,
                    message: demoRequest.message,
                    requestedDate: demoRequest.requestedDate ? new Date(demoRequest.requestedDate).toISOString() : undefined,
                  });
                }
              }}
              disabled={!demoRequest.name || !demoRequest.businessEmail || !demoRequest.phone || !demoRequest.message || !demoRequest.requestedDate || demoRequestMutation.isPending}
              data-testid="button-submit-demo"
            >
              Book Demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terms and Conditions Dialog */}
      <Dialog open={isTermsDialogOpen} onOpenChange={setIsTermsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Terms & Conditions</DialogTitle>
            <DialogDescription>
              Please review our terms and conditions
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[50vh] w-full rounded-md border p-4">
            {termsDocuments.filter((doc: any) => doc.isActive).map((doc: any) => (
              <div key={doc.id} className="mb-6">
                <h3 className="text-lg font-semibold mb-2">{doc.title}</h3>
                <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {doc.content}
                </div>
              </div>
            ))}
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setIsTermsDialogOpen(false)} data-testid="button-close-terms">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PayPal Terms and Conditions Dialog */}
      <Dialog open={isPayPalTermsDialogOpen} onOpenChange={setIsPayPalTermsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Terms & Conditions</DialogTitle>
            <DialogDescription>
              Please review and accept our terms to continue with PayPal payment
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[50vh] w-full rounded-md border p-4">
            {termsDocuments.filter((doc: any) => doc.isActive).map((doc: any) => (
              <div key={doc.id} className="mb-6">
                <h3 className="text-lg font-semibold mb-2">{doc.title}</h3>
                <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {doc.content}
                </div>
              </div>
            ))}
          </ScrollArea>
          <div className="flex items-start space-x-2 px-4">
            <Checkbox
              id="paypal-terms"
              checked={paypalTermsAccepted}
              onCheckedChange={(checked) => setPayPalTermsAccepted(checked as boolean)}
              data-testid="checkbox-paypal-terms"
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="paypal-terms"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I accept the Terms & Conditions
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPayPalTermsDialogOpen(false)}>
              Cancel
            </Button>
            {selectedPlan && (
              <PayPalSubscribeButton
                planId={selectedPlan.id}
                planName={selectedPlan.name}
                amount={(getDiscountedPrice(selectedPlan.price || 0, selectedPlan) / 100).toFixed(2)}
                currency={selectedPlan.currency}
                durationType={durationType}
                isPopular={false}
                disabled={!paypalTermsAccepted}
                termsVersion={termsDocuments.find((t: any) => t.type === "MAIN" && t.isActive)?.version || "1.0"}
              />
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
