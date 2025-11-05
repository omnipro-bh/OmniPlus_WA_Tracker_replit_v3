import { Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, MessageSquare, Users, Zap, Bot, BarChart3, Shield, icons } from "lucide-react";
import heroImage from "@assets/aiease_1762244695579_1762244824751.png";
import { ThemeToggle } from "@/components/theme-toggle";
import { useQuery } from "@tanstack/react-query";
import type { Plan } from "@shared/schema";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Helper function to convert icon name to PascalCase
const toPascalCase = (str: string): string => {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
};

// Helper function to dynamically render Lucide icons
const renderIcon = (iconName: string | null, className: string = "h-6 w-6") => {
  if (!iconName) return <MessageSquare className={className} />;
  
  // Convert to PascalCase (e.g., "waypoints" -> "Waypoints", "bell-ring" -> "BellRing")
  const pascalCaseName = toPascalCase(iconName);
  const IconComponent = (icons as any)[pascalCaseName];
  
  if (IconComponent) {
    return <IconComponent className={className} />;
  }
  
  // Fallback to MessageSquare if icon not found
  console.warn(`Icon "${iconName}" (${pascalCaseName}) not found in lucide-react, using fallback`);
  return <MessageSquare className={className} />;
};

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

// Free email providers to reject
const FREE_EMAIL_PROVIDERS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'yandex.com', 'zoho.com'
];

const isBusinessEmail = (email: string): boolean => {
  const domain = email.split('@')[1]?.toLowerCase();
  return !FREE_EMAIL_PROVIDERS.includes(domain);
};

export default function Landing() {
  const { toast } = useToast();
  
  // Fetch auth settings
  const { data: authSettings } = useQuery<{enableSignin: boolean; enableSignup: boolean}>({
    queryKey: ["/api/settings/auth"],
  });

  const enableSignin = authSettings?.enableSignin ?? true; // Default to true
  const enableSignup = authSettings?.enableSignup ?? true; // Default to true
  
  // Fetch plans published on homepage
  const { data: allPlans = [] } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });
  
  // Filter plans that are published on homepage
  const plans = allPlans.filter((plan: any) => plan.publishedOnHomepage);

  // Fetch dynamic homepage features
  const { data: allFeatures = [] } = useQuery<any[]>({
    queryKey: ["/api/homepage-features"],
  });
  const features = allFeatures.filter((f: any) => f.published).sort((a: any, b: any) => a.sortOrder - b.sortOrder);

  // Fetch dynamic use cases
  const { data: allUseCases = [] } = useQuery<any[]>({
    queryKey: ["/api/use-cases"],
  });
  const useCases = allUseCases.filter((u: any) => u.published).sort((a: any, b: any) => a.sortOrder - b.sortOrder);

  // Dialog state
  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [showDemoDialog, setShowDemoDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  // Form state for quote request
  const [quoteName, setQuoteName] = useState("");
  const [quotePhone, setQuotePhone] = useState("");
  const [quoteEmail, setQuoteEmail] = useState("");
  const [quoteMessage, setQuoteMessage] = useState("");

  // Form state for demo booking
  const [demoName, setDemoName] = useState("");
  const [demoPhone, setDemoPhone] = useState("");
  const [demoEmail, setDemoEmail] = useState("");
  const [demoMessage, setDemoMessage] = useState("");
  const [demoDate, setDemoDate] = useState<Date>();

  // Submit mutations
  const submitQuoteMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/plan-requests", data);
    },
    onSuccess: () => {
      toast({ title: "Request submitted!", description: "We'll contact you soon about your quote." });
      setShowQuoteDialog(false);
      setQuoteName("");
      setQuotePhone("");
      setQuoteEmail("");
      setQuoteMessage("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Submission failed", 
        description: error.error || "Please try again later",
        variant: "destructive"
      });
    },
  });

  const submitDemoMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/plan-requests", data);
    },
    onSuccess: () => {
      toast({ title: "Demo booked!", description: "We'll contact you to confirm your demo session." });
      setShowDemoDialog(false);
      setDemoName("");
      setDemoPhone("");
      setDemoEmail("");
      setDemoMessage("");
      setDemoDate(undefined);
    },
    onError: (error: any) => {
      toast({ 
        title: "Booking failed", 
        description: error.error || "Please try again later",
        variant: "destructive"
      });
    },
  });

  const handleQuoteSubmit = () => {
    if (!quoteName || !quotePhone || !quoteEmail || !quoteMessage) {
      toast({ title: "Missing fields", description: "Please fill all fields", variant: "destructive" });
      return;
    }

    if (!isBusinessEmail(quoteEmail)) {
      toast({ 
        title: "Business email required", 
        description: "Please use your company email address (not gmail, yahoo, etc.)",
        variant: "destructive"
      });
      return;
    }

    submitQuoteMutation.mutate({
      planId: selectedPlan?.id,
      name: quoteName,
      phone: quotePhone,
      businessEmail: quoteEmail,
      message: quoteMessage,
      requestedDate: null,
    });
  };

  const handleDemoSubmit = () => {
    if (!demoName || !demoPhone || !demoEmail || !demoMessage || !demoDate) {
      toast({ title: "Missing fields", description: "Please fill all fields", variant: "destructive" });
      return;
    }

    if (!isBusinessEmail(demoEmail)) {
      toast({ 
        title: "Business email required", 
        description: "Please use your company email address (not gmail, yahoo, etc.)",
        variant: "destructive"
      });
      return;
    }

    submitDemoMutation.mutate({
      planId: selectedPlan?.id,
      name: demoName,
      phone: demoPhone,
      businessEmail: demoEmail,
      message: demoMessage,
      requestedDate: demoDate.toISOString(),
    });
  };

  const handlePlanAction = (plan: Plan) => {
    setSelectedPlan(plan);
    if (plan.requestType === "REQUEST_QUOTE") {
      setShowQuoteDialog(true);
    } else if (plan.requestType === "BOOK_DEMO") {
      setShowDemoDialog(true);
    }
  };

  // Find the first BOOK_DEMO plan for the hero button
  const firstDemoPlan = plans.find((p: any) => p.requestType === "BOOK_DEMO");

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold">omniplus</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium hover-elevate px-3 py-2 rounded-md">
                Features
              </a>
              <a href="#use-cases" className="text-sm font-medium hover-elevate px-3 py-2 rounded-md">
                Use Cases
              </a>
              {plans.length > 0 && (
                <a href="#pricing" className="text-sm font-medium hover-elevate px-3 py-2 rounded-md">
                  Pricing
                </a>
              )}
              <button 
                onClick={() => setShowQuoteDialog(true)}
                className="text-sm font-medium hover-elevate px-3 py-2 rounded-md"
                data-testid="button-contact"
              >
                Contact
              </button>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {enableSignin && (
                <Link href="/login">
                  <Button variant="ghost" data-testid="button-login">
                    Log In
                  </Button>
                </Link>
              )}
              {enableSignup && (
                <Link href="/signup">
                  <Button data-testid="button-signup">Sign Up</Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tight lg:text-7xl">
                  Automate your business & grow{" "}
                  <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">
                    faster
                  </span>{" "}
                  with OMNI PLUS
                </h1>
                <p className="text-lg text-muted-foreground">
                  Send Broadcast messages, build Chatbots, Automate tasks & notifications and manage
                  contacts/campaigns in CRM with OMNI PLUS's all-in-one dashboard.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                {enableSignup && (
                  <Link href="/signup">
                    <Button size="lg" className="w-full sm:w-auto" data-testid="button-start-trial">
                      Start Free Trial
                    </Button>
                  </Link>
                )}
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="w-full sm:w-auto" 
                  data-testid="button-book-demo"
                  onClick={() => {
                    if (firstDemoPlan) {
                      setSelectedPlan(firstDemoPlan);
                      setShowDemoDialog(true);
                    }
                  }}
                  disabled={!firstDemoPlan}
                >
                  Book a Demo
                </Button>
              </div>
              <div className="text-lg font-medium text-muted-foreground">
                Transform your business with WhatsApp Automation & Chatbot
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-info/20 rounded-2xl blur-3xl" />
                <img 
                  src={heroImage} 
                  alt="WhatsApp Campaign Analytics - Notification Campaigns, Rich Media Messages, Click-to-WhatsApp Ads with 92% Read Rate and 76% Reply Rate" 
                  className="relative rounded-2xl shadow-2xl"
                  data-testid="img-hero"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Band */}
      <section className="border-y border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-foreground">1000+</p>
              <p className="mt-2 text-sm text-muted-foreground">Active Users</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-foreground">1M+</p>
              <p className="mt-2 text-sm text-muted-foreground">Messages Delivered</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-foreground">99.9%</p>
              <p className="mt-2 text-sm text-muted-foreground">Uptime SLA</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-foreground">24/7</p>
              <p className="mt-2 text-sm text-muted-foreground">Support</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl font-bold tracking-tight lg:text-4xl">
              Powerful Features for Your Business
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to manage WhatsApp messaging at scale. Simple, powerful, and built
              for growth.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.length > 0 ? (
              features.map((feature: any) => (
                <Card key={feature.id} className="hover-elevate transition-all" data-testid={`feature-${feature.id}`}>
                  <CardHeader>
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {renderIcon(feature.icon)}
                    </div>
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription>
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))
            ) : (
              <>
                <Card className="hover-elevate transition-all">
                  <CardHeader>
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <MessageSquare className="h-6 w-6" />
                    </div>
                    <CardTitle>Multi-Device Management</CardTitle>
                    <CardDescription>
                      Connect and manage multiple WhatsApp devices from a single dashboard. Scale your
                      messaging infrastructure effortlessly.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="hover-elevate transition-all">
                  <CardHeader>
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Zap className="h-6 w-6" />
                    </div>
                    <CardTitle>Interactive Messages</CardTitle>
                    <CardDescription>
                      Send rich messages with buttons, headers, footers and custom actions. Create
                      engaging conversations with your customers.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="hover-elevate transition-all">
                  <CardHeader>
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Users className="h-6 w-6" />
                    </div>
                    <CardTitle>Bulk Broadcasting</CardTitle>
                    <CardDescription>
                      Import CSV files and send personalized messages to thousands of contacts
                      simultaneously with intelligent delivery.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="hover-elevate transition-all">
                  <CardHeader>
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Bot className="h-6 w-4" />
                    </div>
                    <CardTitle>Chatbot Builder</CardTitle>
                    <CardDescription>
                      Build intelligent chatbots with our visual workflow editor. Automate responses and
                      create conversational experiences.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="hover-elevate transition-all">
                  <CardHeader>
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <BarChart3 className="h-6 w-6" />
                    </div>
                    <CardTitle>Real-time Analytics</CardTitle>
                    <CardDescription>
                      Track message delivery, read receipts, and engagement metrics. Make data-driven
                      decisions with comprehensive reporting.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="hover-elevate transition-all">
                  <CardHeader>
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Shield className="h-6 w-6" />
                    </div>
                    <CardTitle>Enterprise Security</CardTitle>
                    <CardDescription>
                      Bank-level encryption, role-based access control, and compliance-ready
                      infrastructure to keep your data safe.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Use Cases - Only show if there are published use cases */}
      {useCases.length > 0 && (
        <section id="use-cases" className="py-20 lg:py-32 bg-card/30">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="text-center space-y-4 mb-16">
              <h2 className="text-3xl font-bold tracking-tight lg:text-4xl">
                Real-World Use Cases
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Discover how businesses across industries leverage our platform to transform their WhatsApp communications.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {useCases.map((useCase: any) => (
                <Card key={useCase.id} className="overflow-hidden hover-elevate transition-all" data-testid={`usecase-${useCase.id}`}>
                  {useCase.image && (
                    <div className="aspect-video w-full overflow-hidden bg-muted">
                      <img
                        src={useCase.image}
                        alt={useCase.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle>{useCase.title}</CardTitle>
                    <CardDescription>
                      {useCase.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Pricing - Only show if there are published plans */}
      {plans.length > 0 && (
        <section id="pricing" className="py-20 lg:py-32 bg-card/30">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="text-center space-y-4 mb-16">
              <h2 className="text-3xl font-bold tracking-tight lg:text-4xl">
                Simple, Transparent Pricing
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Choose the plan that fits your business. Scale up or down anytime.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan: any, index: number) => (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col ${
                    index === 1 ? "border-primary shadow-lg" : ""
                  }`}
                >
                  {index === 1 && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                        POPULAR
                      </span>
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle>{plan.name}</CardTitle>
                    <div className="mt-4">
                      {plan.price ? (
                        <>
                          <span className="text-4xl font-bold">{getCurrencySymbol(plan.currency)}{(plan.price / 100).toFixed(0)}</span>
                          <span className="text-muted-foreground">
                            /{plan.billingPeriod === "MONTHLY" ? "month" : plan.billingPeriod === "SEMI_ANNUAL" ? "6 months" : "year"}
                          </span>
                        </>
                      ) : (
                        <span className="text-4xl font-bold">Custom</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <ul className="space-y-3">
                      {(plan.features || []).map((feature: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    {plan.requestType === "PAID" ? (
                      enableSignup ? (
                        <Link href="/signup" className="w-full">
                          <Button
                            className="w-full"
                            variant={index === 1 ? "default" : "outline"}
                            data-testid={`button-plan-${plan.name.toLowerCase()}`}
                          >
                            Get Started
                          </Button>
                        </Link>
                      ) : (
                        <Button
                          className="w-full"
                          variant={index === 1 ? "default" : "outline"}
                          disabled
                          data-testid={`button-plan-${plan.name.toLowerCase()}`}
                        >
                          Sign Up Disabled
                        </Button>
                      )
                    ) : (
                      <Button
                        className="w-full"
                        variant={index === 1 ? "default" : "outline"}
                        data-testid={`button-plan-${plan.name.toLowerCase()}`}
                        onClick={() => handlePlanAction(plan)}
                      >
                        {plan.requestType === "REQUEST_QUOTE" ? "Request Quote" : "Book Demo"}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-primary" />
                <span className="text-xl font-bold">omniplus</span>
              </div>
              <p className="text-sm text-muted-foreground">
                The all-in-one WhatsApp automation platform for modern businesses.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#features" className="hover:text-foreground">
                    Features
                  </a>
                </li>
                {plans.length > 0 && (
                  <li>
                    <a href="#pricing" className="hover:text-foreground">
                      Pricing
                    </a>
                  </li>
                )}
                <li>
                  <a href="#" className="hover:text-foreground">
                    API Docs
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="/about" className="hover:text-foreground" data-testid="link-about">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground">
                    Blog
                  </a>
                </li>
                <li>
                  <button 
                    onClick={() => setShowQuoteDialog(true)}
                    className="hover:text-foreground text-sm"
                    data-testid="button-footer-contact"
                  >
                    Contact
                  </button>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="/privacy-policy" className="hover:text-foreground" data-testid="link-privacy">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="/terms-conditions" className="hover:text-foreground" data-testid="link-terms">
                    Terms
                  </a>
                </li>
                <li>
                  <a href="/button-terms" className="hover:text-foreground" data-testid="link-button-terms">
                    Button Terms
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-border pt-8 text-center text-sm text-muted-foreground">
            © 2024 OmniPlus. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Request Quote Dialog */}
      <Dialog open={showQuoteDialog} onOpenChange={setShowQuoteDialog}>
        <DialogContent data-testid="dialog-request-quote">
          <DialogHeader>
            <DialogTitle>Request Quote for {selectedPlan?.name}</DialogTitle>
            <DialogDescription>
              Fill in your details and we'll get back to you with a customized quote.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="quote-name">Name</Label>
              <Input
                id="quote-name"
                data-testid="input-quote-name"
                placeholder="Your full name"
                value={quoteName}
                onChange={(e) => setQuoteName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="quote-email">Business Email</Label>
              <Input
                id="quote-email"
                data-testid="input-quote-email"
                type="email"
                placeholder="you@company.com"
                value={quoteEmail}
                onChange={(e) => setQuoteEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Please use your company email (not gmail, yahoo, etc.)
              </p>
            </div>
            <div>
              <Label htmlFor="quote-phone">Phone Number</Label>
              <Input
                id="quote-phone"
                data-testid="input-quote-phone"
                type="tel"
                placeholder="+973 XXXX XXXX"
                value={quotePhone}
                onChange={(e) => setQuotePhone(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="quote-message">Message</Label>
              <Textarea
                id="quote-message"
                data-testid="textarea-quote-message"
                placeholder="Tell us about your requirements..."
                value={quoteMessage}
                onChange={(e) => setQuoteMessage(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowQuoteDialog(false)}
              data-testid="button-cancel-quote"
            >
              Cancel
            </Button>
            <Button
              onClick={handleQuoteSubmit}
              disabled={submitQuoteMutation.isPending}
              data-testid="button-submit-quote"
            >
              {submitQuoteMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Book Demo Dialog */}
      <Dialog open={showDemoDialog} onOpenChange={setShowDemoDialog}>
        <DialogContent data-testid="dialog-book-demo">
          <DialogHeader>
            <DialogTitle>Book a Demo for {selectedPlan?.name}</DialogTitle>
            <DialogDescription>
              Schedule a personalized demo with our team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="demo-name">Name</Label>
              <Input
                id="demo-name"
                data-testid="input-demo-name"
                placeholder="Your full name"
                value={demoName}
                onChange={(e) => setDemoName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="demo-email">Business Email</Label>
              <Input
                id="demo-email"
                data-testid="input-demo-email"
                type="email"
                placeholder="you@company.com"
                value={demoEmail}
                onChange={(e) => setDemoEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Please use your company email (not gmail, yahoo, etc.)
              </p>
            </div>
            <div>
              <Label htmlFor="demo-phone">Phone Number</Label>
              <Input
                id="demo-phone"
                data-testid="input-demo-phone"
                type="tel"
                placeholder="+973 XXXX XXXX"
                value={demoPhone}
                onChange={(e) => setDemoPhone(e.target.value)}
              />
            </div>
            <div>
              <Label>Preferred Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !demoDate && "text-muted-foreground"
                    )}
                    data-testid="button-demo-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {demoDate ? format(demoDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={demoDate}
                    onSelect={setDemoDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="demo-message">Message</Label>
              <Textarea
                id="demo-message"
                data-testid="textarea-demo-message"
                placeholder="Tell us what you'd like to see in the demo..."
                value={demoMessage}
                onChange={(e) => setDemoMessage(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDemoDialog(false)}
              data-testid="button-cancel-demo"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDemoSubmit}
              disabled={submitDemoMutation.isPending}
              data-testid="button-submit-demo"
            >
              {submitDemoMutation.isPending ? "Booking..." : "Book Demo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
