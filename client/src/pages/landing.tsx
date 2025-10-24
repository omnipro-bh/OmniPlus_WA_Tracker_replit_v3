import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, MessageSquare, Users, Zap, Bot, BarChart3, Shield } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Landing() {
  const plans = [
    {
      name: "Starter",
      price: 29,
      features: [
        "1 WhatsApp Channel",
        "100 messages/day",
        "500 bulk messages/month",
        "Basic templates",
        "Email support",
      ],
    },
    {
      name: "Growth",
      price: 79,
      popular: true,
      features: [
        "3 WhatsApp Channels",
        "500 messages/day",
        "5,000 bulk messages/month",
        "Advanced templates",
        "Chatbot builder",
        "Priority support",
      ],
    },
    {
      name: "Advanced",
      price: 199,
      features: [
        "10 WhatsApp Channels",
        "2,000 messages/day",
        "50,000 bulk messages/month",
        "Custom workflows",
        "API access",
        "Dedicated support",
      ],
    },
    {
      name: "Enterprise",
      price: "Custom",
      features: [
        "Unlimited channels",
        "Unlimited messages",
        "Custom integrations",
        "SLA guarantee",
        "Account manager",
        "White-label option",
      ],
    },
  ];

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
              <a href="#pricing" className="text-sm font-medium hover-elevate px-3 py-2 rounded-md">
                Pricing
              </a>
              <a href="#contact" className="text-sm font-medium hover-elevate px-3 py-2 rounded-md">
                Contact
              </a>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link href="/login">
                <Button variant="ghost" data-testid="button-login">
                  Log In
                </Button>
              </Link>
              <Link href="/signup">
                <Button data-testid="button-signup">Sign Up</Button>
              </Link>
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
                <Link href="/signup">
                  <Button size="lg" className="w-full sm:w-auto" data-testid="button-start-trial">
                    Start Free Trial
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="w-full sm:w-auto" data-testid="button-book-demo">
                  Book a Demo
                </Button>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" />
                  No credit card required
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" />
                  14 day free trial
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" />
                  Cancel anytime
                </div>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-info/20 rounded-2xl blur-3xl" />
                <Card className="relative rotate-2 shadow-2xl border-primary/20">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Dashboard Overview</CardTitle>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-success animate-pulse" />
                        <span className="text-xs text-success font-medium">10,000+</span>
                      </div>
                    </div>
                    <CardDescription>Messages Sent Today</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Channels</p>
                        <p className="text-2xl font-bold">3/5</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Days Left</p>
                        <p className="text-2xl font-bold text-success">28</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
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
              <p className="text-4xl font-bold text-foreground">50K+</p>
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
                  <Bot className="h-6 w-6" />
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
          </div>
        </div>
      </section>

      {/* Pricing */}
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
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={`relative flex flex-col ${
                  plan.popular ? "border-primary shadow-lg" : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                      POPULAR
                    </span>
                  </div>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <div className="mt-4">
                    {typeof plan.price === "number" ? (
                      <>
                        <span className="text-4xl font-bold">${plan.price}</span>
                        <span className="text-muted-foreground">/month</span>
                      </>
                    ) : (
                      <span className="text-4xl font-bold">{plan.price}</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Link href="/signup" className="w-full">
                    <Button
                      className="w-full"
                      variant={plan.popular ? "default" : "outline"}
                      data-testid={`button-plan-${plan.name.toLowerCase()}`}
                    >
                      Get Started
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

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
                <li>
                  <a href="#pricing" className="hover:text-foreground">
                    Pricing
                  </a>
                </li>
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
                  <a href="#" className="hover:text-foreground">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#contact" className="hover:text-foreground">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-foreground">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground">
                    Terms
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
    </div>
  );
}
