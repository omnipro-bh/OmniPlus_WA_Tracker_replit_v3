import { storage } from "./storage";

// Default WHAPI project ID (can be overridden in settings)
const DEFAULT_WHAPI_PROJECT_ID = "HPN0HOhFfDL1GFg154Pl";

// WHAPI Configuration
export async function getWhapiConfig() {
  const partnerToken = process.env.WHAPI_PARTNER_TOKEN || 
    (await storage.getSetting("whapi_partner_token"))?.value || "";
  const baseUrl = process.env.WHAPI_BASE || 
    (await storage.getSetting("whapi_base_url"))?.value || 
    "https://manager.whapi.cloud";
  const projectId = process.env.WHAPI_PROJECT_ID ||
    (await storage.getSetting("whapi_project_id"))?.value ||
    DEFAULT_WHAPI_PROJECT_ID;
  
  return { partnerToken, baseUrl, projectId };
}

// Test WHAPI connection
export async function testWhapiConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const { partnerToken, baseUrl } = await getWhapiConfig();
    
    if (!partnerToken) {
      return { success: false, message: "WHAPI Partner Token not configured" };
    }

    // Validate token format (should start with "Bearer ")
    if (!partnerToken.startsWith("Bearer ")) {
      return { 
        success: false, 
        message: "Invalid token format. Token should start with 'Bearer '" 
      };
    }

    // Token is configured and has correct format
    return { 
      success: true, 
      message: "WHAPI token configured successfully. Connection will be verified when creating channels." 
    };
  } catch (error: any) {
    return { success: false, message: `Connection test failed: ${error.message}` };
  }
}

// Create a new WHAPI channel
export async function createWhapiChannel(channelName: string, phone: string) {
  const { partnerToken, baseUrl, projectId } = await getWhapiConfig();
  
  console.log("Creating WHAPI channel with projectId:", projectId);
  
  // Use PUT method as per WHAPI Partner API spec
  const response = await fetch(`${baseUrl}/channels`, {
    method: "PUT",
    headers: {
      "Authorization": partnerToken, // Token already includes "Bearer "
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ 
      name: channelName, 
      phone: phone,
      projectId: projectId  // WHAPI expects camelCase "projectId"
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create WHAPI channel: ${error}`);
  }

  // Response includes: { id, token, phone, status, etc. }
  return await response.json();
}

// Get channel details from WHAPI
export async function getWhapiChannel(whapiChannelId: string) {
  const { partnerToken, baseUrl } = await getWhapiConfig();
  
  const response = await fetch(`${baseUrl}/channels/${whapiChannelId}`, {
    headers: {
      "Authorization": partnerToken,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get WHAPI channel: ${error}`);
  }

  return await response.json();
}

// Get QR code for channel authentication
// Uses channel token (not partner token) via gate.whapi.cloud
export async function getChannelQRCode(channelToken: string) {
  // Ensure token has Bearer prefix (add if missing)
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  
  const response = await fetch("https://gate.whapi.cloud/users/login?wakeup=true", {
    headers: {
      "Authorization": authToken,
      "Accept": "application/json",
    },
  });

  // 409 means channel is already authenticated
  if (response.status === 409) {
    return { 
      httpStatus: 409, 
      alreadyAuthenticated: true,
      message: "Channel already authenticated" 
    };
  }

  // 406/422 means QR expired or other error
  if (response.status === 406 || response.status === 422) {
    const errorData = await response.json().catch(() => ({}));
    return {
      httpStatus: response.status,
      error: true,
      message: errorData.error?.message || "QR code expired or invalid"
    };
  }

  // Any other non-OK status
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Failed to get QR code (status ${response.status})`);
  }

  // 200 response: { base64, expire, status }
  const data = await response.json();
  return { 
    httpStatus: 200,
    ...data 
  };
}

// Get channel status from WHAPI Gate API
// Uses channel token (not partner token) via gate.whapi.cloud
export async function getChannelStatus(whapiChannelId: string, channelToken: string) {
  // Ensure token has Bearer prefix (add if missing)
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  
  const response = await fetch(`https://gate.whapi.cloud/channels/${whapiChannelId}`, {
    headers: {
      "Authorization": authToken,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Failed to get channel status (status ${response.status})`);
  }

  // Response: { activeTill, apiUrl, creationTS, status, etc. }
  return await response.json();
}

// Logout channel from WhatsApp
// Uses channel token (not partner token) via gate.whapi.cloud
export async function logoutChannel(channelToken: string) {
  // Ensure token has Bearer prefix (add if missing)
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  
  const response = await fetch("https://gate.whapi.cloud/users/logout", {
    method: "POST",
    headers: {
      "Authorization": authToken,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Failed to logout channel (status ${response.status})`);
  }

  // Response: { status: "OK" } or error
  return await response.json();
}

// Extend channel days
export async function extendWhapiChannel(whapiChannelId: string, days: number, comment: string = "Auto top-up") {
  const { partnerToken, baseUrl } = await getWhapiConfig();
  
  const response = await fetch(`${baseUrl}/channels/${whapiChannelId}/extend`, {
    method: "POST",
    headers: {
      "Authorization": partnerToken,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ days, comment }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to extend channel: ${error}`);
  }

  return await response.json();
}

// Send a message via WHAPI (uses gate.whapi.cloud with channel token)
export async function sendWhapiMessage(channelToken: string, payload: {
  to: string;
  body: string;
  header?: string;
  footer?: string;
  buttons?: string[];
}) {
  // Ensure token has Bearer prefix (add if missing)
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  
  const response = await fetch("https://gate.whapi.cloud/messages/text", {
    method: "POST",
    headers: {
      "Authorization": authToken,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send message: ${error}`);
  }

  return await response.json();
}

// Delete channel (uses Partner API)
export async function deleteWhapiChannel(whapiChannelId: string) {
  const { partnerToken, baseUrl } = await getWhapiConfig();
  
  const response = await fetch(`${baseUrl}/channels/${whapiChannelId}`, {
    method: "DELETE",
    headers: {
      "Authorization": partnerToken,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete channel: ${error}`);
  }

  return { success: true };
}

// Send interactive message with buttons (uses Gate API with channel token)
export async function sendInteractiveMessage(channelToken: string, payload: {
  to: string;
  header?: { text: string };
  body: { text: string };
  footer?: { text: string };
  action: {
    buttons: Array<{ type: string; title: string; id: string }>;
  };
  type: string;
}) {
  // Ensure token has Bearer prefix (add if missing)
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  
  const response = await fetch("https://gate.whapi.cloud/messages/interactive", {
    method: "POST",
    headers: {
      "Authorization": authToken,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error || `WHAPI send failed (status ${response.status})`);
  }

  // Response should include message ID and other details
  return await response.json();
}
