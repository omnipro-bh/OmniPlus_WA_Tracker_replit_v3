import { Request } from "express";

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;

const baseURL = 
  process.env.NODE_ENV === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

let cachedAccessToken: string | null = null;
let tokenExpiry: number = 0;

async function generateAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry) {
    return cachedAccessToken;
  }

  const auth = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(`${baseURL}/v1/oauth2/token`, {
    method: "POST",
    body: "grant_type=client_credentials",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to generate PayPal access token: ${response.statusText}`);
  }

  const data = await response.json();
  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

  return cachedAccessToken!;
}

export async function verifyWebhookSignature(
  req: Request,
  webhookId: string
): Promise<boolean> {
  try {
    const headers = {
      "paypal-auth-algo": req.headers["paypal-auth-algo"] as string,
      "paypal-cert-url": req.headers["paypal-cert-url"] as string,
      "paypal-transmission-id": req.headers["paypal-transmission-id"] as string,
      "paypal-transmission-sig": req.headers["paypal-transmission-sig"] as string,
      "paypal-transmission-time": req.headers["paypal-transmission-time"] as string,
    };

    if (!headers["paypal-transmission-id"] || !headers["paypal-transmission-sig"]) {
      console.error("[PayPal Webhook] Missing required PayPal headers");
      return false;
    }

    const accessToken = await generateAccessToken();
    const verifyUrl = `${baseURL}/v1/notifications/verify-webhook-signature`;

    const response = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: req.body,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[PayPal Webhook] Verification API error:", errorData);
      return false;
    }

    const data = await response.json();
    return data.verification_status === "SUCCESS";
  } catch (error) {
    console.error("[PayPal Webhook] Verification error:", error);
    return false;
  }
}
