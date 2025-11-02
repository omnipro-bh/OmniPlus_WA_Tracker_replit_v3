import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Check, Upload, MessageSquare, Calendar } from "lucide-react";
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
  const [durationType, setDurationType] = useState<"MONTHLY" | "SEMI_ANNUAL" | "ANNUAL">("MONTHLY");
  const [isOfflineDialogOpen, setIsOfflineDialogOpen] = useState(false);
  const [isQuoteDialogOpen, setIsQuoteDialogOpen] = useState(false);
  const [isDemoDialogOpen, setIsDemoDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [offlinePayment, setOfflinePayment] = useState({
    amount: "",
    currency: "USD",
    reference: "",
    proofUrl: "",
  });
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

  const offlinePaymentMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/subscribe/offline", data);
    },
    onSuccess: () => {
      setIsOfflineDialogOpen(false);
      setOfflinePayment({ amount: "", currency: "USD", reference: "", proofUrl: "" });
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

  const getDiscountedPrice = (price: number) => {
    if (durationType === "SEMI_ANNUAL") return price * 6 * 0.95;
    if (durationType === "ANNUAL") return price * 12 * 0.9;
    return price;
  };

  const handleOfflinePayment = (plan: Plan) => {
    setSelectedPlan(plan);
    setOfflinePayment({
      ...offlinePayment,
      amount: (getDiscountedPrice(plan.price || 0) / 100).toFixed(2),
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
        {plans.filter(plan => plan.published).map((plan, index) => {
          const isPopular = index === 1;
          const discountedPrice = getDiscountedPrice(plan.price || 0);
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
                  {plan.requestType === "PAID" && plan.price ? (
                    <>
                      <span className="text-4xl font-bold">{getCurrencySymbol(plan.currency)}{(discountedPrice / 100).toFixed(0)}</span>
                      <span className="text-muted-foreground">/
                        {durationType === "MONTHLY" ? "month" : durationType === "SEMI_ANNUAL" ? "6 months" : "year"}
                      </span>
                      {durationType !== "MONTHLY" && (
                        <div className="text-sm text-muted-foreground line-through">
                          {getCurrencySymbol(plan.currency)}{(plan.price / 100).toFixed(0)}
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
                {plan.requestType === "PAID" && (
                  <>
                    {/* Only show PayPal button if PayPal is enabled for this plan */}
                    {Array.isArray((plan as any).paymentMethods) && (plan as any).paymentMethods.includes("paypal") && (
                      <PayPalSubscribeButton
                        planId={plan.id}
                        planName={plan.name}
                        amount={(discountedPrice / 100).toFixed(2)}
                        currency={plan.currency}
                        durationType={durationType}
                        isPopular={isPopular}
                      />
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
                    proofUrl: offlinePayment.proofUrl || undefined,
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
    </div>
  );
}
