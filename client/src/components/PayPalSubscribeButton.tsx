import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PayPalSubscribeButtonProps {
  planId: number;
  planName: string;
  amount: string;
  currency: string;
  durationType: "MONTHLY" | "SEMI_ANNUAL" | "ANNUAL";
  isPopular?: boolean;
  disabled?: boolean;
  termsVersion?: string;
}

export default function PayPalSubscribeButton({
  planId,
  planName,
  amount,
  currency,
  durationType,
  isPopular = false,
  disabled = false,
  termsVersion = "1.0",
}: PayPalSubscribeButtonProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const buttonContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadPayPalSDK = async () => {
      try {
        // Get client token from backend
        const response = await fetch("/paypal/setup");
        const { clientToken } = await response.json();

        // Load PayPal SDK if not already loaded
        if (!(window as any).paypal) {
          const script = document.createElement("script");
          script.src = import.meta.env.PROD
            ? "https://www.paypal.com/web-sdk/v6/core"
            : "https://www.sandbox.paypal.com/web-sdk/v6/core";
          script.async = true;
          script.onload = () => initPayPal(clientToken);
          document.body.appendChild(script);
        } else {
          await initPayPal(clientToken);
        }
      } catch (error) {
        console.error("Failed to load PayPal SDK", error);
        toast({
          title: "PayPal Error",
          description: "Failed to load payment system",
          variant: "destructive",
        });
      }
    };

    const initPayPal = async (clientToken: string) => {
      try {
        const sdkInstance = await (window as any).paypal.createInstance({
          clientToken,
          components: ["paypal-payments"],
        });

        const paypalCheckout = sdkInstance.createPayPalOneTimePaymentSession({
          onApprove: async (data: any) => {
            setIsProcessing(true);
            try {
              // Capture payment
              const captureResponse = await fetch(`/paypal/order/${data.orderId}/capture`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
              });

              if (!captureResponse.ok) {
                throw new Error("Failed to capture payment");
              }

              // Confirm subscription with backend
              await apiRequest("POST", "/api/subscribe/paypal/confirm", {
                planId,
                durationType,
                orderId: data.orderId,
                termsVersion,
              });

              queryClient.invalidateQueries({ queryKey: ["/api/me"] });
              toast({
                title: "Subscription Activated",
                description: `Your ${planName} subscription has been activated successfully!`,
              });
            } catch (error: any) {
              toast({
                title: "Payment Failed",
                description: error.message || "Could not process payment",
                variant: "destructive",
              });
            } finally {
              setIsProcessing(false);
            }
          },
          onCancel: () => {
            setIsProcessing(false);
            toast({
              title: "Payment Cancelled",
              description: "You cancelled the PayPal payment",
            });
          },
          onError: (error: any) => {
            console.error("PayPal error:", error);
            setIsProcessing(false);
            toast({
              title: "Payment Error",
              description: "An error occurred during payment",
              variant: "destructive",
            });
          },
        });

        const handleClick = async () => {
          try {
            setIsProcessing(true);
            // Create order
            const orderResponse = await fetch("/paypal/order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                amount,
                currency,
                intent: "CAPTURE",
              }),
            });

            if (!orderResponse.ok) {
              throw new Error("Failed to create order");
            }

            const orderData = await orderResponse.json();
            await paypalCheckout.start(
              { paymentFlow: "auto" },
              Promise.resolve({ orderId: orderData.id })
            );
          } catch (error: any) {
            toast({
              title: "Error",
              description: error.message,
              variant: "destructive",
            });
            setIsProcessing(false);
          }
        };

        if (buttonContainerRef.current) {
          buttonContainerRef.current.onclick = handleClick;
          setSdkReady(true);
        }
      } catch (error) {
        console.error("PayPal init error:", error);
        toast({
          title: "PayPal Error",
          description: "Failed to initialize payment system",
          variant: "destructive",
        });
      }
    };

    if (!disabled) {
      loadPayPalSDK();
    }
  }, [amount, currency, planId, durationType, planName, disabled, toast]);

  return (
    <div ref={buttonContainerRef}>
      <Button
        className="w-full"
        variant={isPopular ? "default" : "outline"}
        disabled={disabled || isProcessing || !sdkReady}
        data-testid={`button-subscribe-${planName.toLowerCase()}`}
      >
        {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isProcessing ? "Processing..." : "Subscribe with PayPal"}
      </Button>
    </div>
  );
}
