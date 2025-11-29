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
      message: "API token configured successfully. Connection will be verified when creating channels." 
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
  action?: {
    buttons?: Array<{ type: string; title: string; id: string; phone_number?: string; url?: string; copy_code?: string }>;
    list?: {
      sections: Array<{
        title: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
      label: string;
    };
  };
  type: string;
  media?: string;
  no_encode?: boolean;
}) {
  if (!channelToken) {
    throw new Error("Channel token is required but was not found. Please ensure the channel has a valid token.");
  }

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
    const errorText = await response.text().catch(() => "");
    let errorData: any = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { rawError: errorText };
    }
    
    console.error(`[WHAPI] sendInteractiveMessage failed:`, {
      status: response.status,
      errorText: errorText.substring(0, 500),
      errorData,
      errorMessage: errorData?.error || errorData?.message || errorData?.rawError
    });
    
    const errorMessage = errorData?.error || errorData?.message || errorData?.rawError || `WHAPI send failed (status ${response.status})`;
    throw new Error(errorMessage || "Unknown WHAPI error");
  }

  // Response should include message ID and other details
  return await response.json();
}

// Send carousel message (uses Gate API with channel token)
export async function sendCarouselMessage(channelToken: string, payload: {
  to: string;
  body: { text: string };
  cards: Array<{
    id: string;
    media: { media: string };
    text: string;
    buttons: Array<{ type: string; title: string; id: string; url?: string }>;
  }>;
}) {
  // Ensure token has Bearer prefix (add if missing)
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  
  const response = await fetch("https://gate.whapi.cloud/messages/carousel", {
    method: "POST",
    headers: {
      "Authorization": authToken,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let errorData: any = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { rawError: errorText };
    }
    
    console.error(`[WHAPI] sendCarouselMessage failed:`, {
      status: response.status,
      errorText: errorText.substring(0, 500),
      errorData,
    });
    
    const errorMessage = errorData?.error || errorData?.message || errorData?.rawError || `WHAPI carousel send failed (status ${response.status})`;
    throw new Error(errorMessage || "Unknown WHAPI carousel error");
  }

  // Response should include message ID and other details
  return await response.json();
}

// Send simple text message (uses Gate API with channel token)
export async function sendTextMessage(channelToken: string, payload: {
  to: string;
  body: string;
}) {
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
    const errorText = await response.text().catch(() => "");
    let errorData: any = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { rawError: errorText };
    }
    
    console.error(`[WHAPI] sendTextMessage failed:`, {
      status: response.status,
      errorText: errorText.substring(0, 500),
      errorData,
    });
    
    const errorMessage = errorData?.error || errorData?.message || errorData?.rawError || `WHAPI text send failed (status ${response.status})`;
    throw new Error(errorMessage || "Unknown WHAPI text error");
  }

  return await response.json();
}

// Send media message (image/video/audio/document) (uses Gate API with channel token)
export async function sendMediaMessage(channelToken: string, payload: {
  to: string;
  media: string;
  caption?: string;
  mediaType?: string;
}) {
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  
  // Map media types to WHAPI types (lowercase for API)
  const mediaTypeMap: Record<string, string> = {
    'Image': 'image',
    'Video': 'video',
    'Audio': 'audio',
    'Document': 'document',
    'Voice': 'voice',
    'GIF': 'gif',
    'Sticker': 'sticker',
  };
  
  const whapiMediaType = mediaTypeMap[payload.mediaType || 'Document'] || 'document';
  
  console.log(`Sending ${whapiMediaType} message with payload:`, JSON.stringify(payload, null, 2));
  
  // Use the same endpoint pattern as buildAndSendNodeMessage (which works)
  const mediaPayload: any = {
    to: payload.to,
    media: payload.media,
  };
  
  if (payload.caption) {
    mediaPayload.caption = payload.caption;
  }
  
  const response = await fetch(`https://gate.whapi.cloud/messages/${whapiMediaType}`, {
    method: "POST",
    headers: {
      "Authorization": authToken,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mediaPayload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let errorData: any = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { rawError: errorText };
    }
    
    console.error(`[WHAPI] sendMediaMessage failed:`, {
      status: response.status,
      mediaType: whapiMediaType,
      errorText: errorText.substring(0, 500),
      errorData,
    });
    
    const errorMessage = errorData?.error || errorData?.message || errorData?.rawError || `WHAPI media send failed (status ${response.status})`;
    throw new Error(errorMessage || "Unknown WHAPI media error");
  }

  return await response.json();
}

// Send location message (uses Gate API with channel token)
export async function sendLocationMessage(channelToken: string, payload: {
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}) {
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  
  const response = await fetch("https://gate.whapi.cloud/messages/location", {
    method: "POST",
    headers: {
      "Authorization": authToken,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let errorData: any = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { rawError: errorText };
    }
    
    console.error(`[WHAPI] sendLocationMessage failed:`, {
      status: response.status,
      errorText: errorText.substring(0, 500),
      errorData,
    });
    
    const errorMessage = errorData?.error || errorData?.message || errorData?.rawError || `WHAPI location send failed (status ${response.status})`;
    throw new Error(errorMessage || "Unknown WHAPI location error");
  }

  return await response.json();
}

// Build and send interactive message based on workflow node type
export async function buildAndSendNodeMessage(channel: any, phone: string, nodeType: string, config: any) {
  const channelToken = channel.whapiChannelToken;

  // Build payload based on node type
  let payload: any = {
    to: phone,
  };

  // Quick Reply Buttons
  if (nodeType === 'quickReply') {
    if (config.headerText) payload.header = { text: config.headerText };
    payload.body = { text: config.bodyText || 'No message' };
    if (config.footerText) payload.footer = { text: config.footerText };
    
    const buttons = (config.buttons || [])
      .filter((btn: any) => btn.title && btn.id)
      .map((btn: any) => ({
        type: 'quick_reply',
        title: btn.title,
        id: btn.id,
      }));
    
    payload.action = { buttons };
    payload.type = 'button';
  }

  // Quick Reply with Image
  else if (nodeType === 'quickReplyImage') {
    payload.body = { text: config.bodyText || 'No message' };
    if (config.footerText) payload.footer = { text: config.footerText };
    
    const buttons = (config.buttons || [])
      .filter((btn: any) => btn.title && btn.id)
      .map((btn: any) => ({
        type: 'quick_reply',
        title: btn.title,
        id: btn.id,
      }));
    
    payload.action = { buttons };
    payload.type = 'button';
    payload.media = config.mediaUrl;
  }

  // Quick Reply with Video
  else if (nodeType === 'quickReplyVideo') {
    payload.body = { text: config.bodyText || 'No message' };
    if (config.footerText) payload.footer = { text: config.footerText };
    
    const buttons = (config.buttons || [])
      .filter((btn: any) => btn.title && btn.id)
      .map((btn: any) => ({
        type: 'quick_reply',
        title: btn.title,
        id: btn.id,
      }));
    
    payload.action = { buttons };
    payload.type = 'button';
    payload.media = config.mediaUrl;
    payload.no_encode = true;
  }

  // List Message
  else if (nodeType === 'listMessage') {
    if (config.headerText) payload.header = { text: config.headerText };
    payload.body = { text: config.bodyText || 'No message' };
    if (config.footerText) payload.footer = { text: config.footerText };
    
    const sections = (config.sections || []).map((section: any) => ({
      title: section.title || 'Options',
      rows: (section.rows || [])
        .filter((row: any) => row.title && row.id)
        .map((row: any) => ({
          id: row.id,
          title: row.title,
          description: row.description || '',
        })),
    }));
    
    payload.action = {
      list: {
        sections,
        label: config.buttonLabel || 'Choose option',
      },
    };
    payload.type = 'list';
  }

  // Merged Buttons (Call + URL + Copy mixed)
  else if (nodeType === 'buttons') {
    if (config.headerText) payload.header = { text: config.headerText };
    payload.body = { text: config.bodyText || 'No message' };
    if (config.footerText) payload.footer = { text: config.footerText };
    
    const buttons = (config.buttons || [])
      .filter((btn: any) => btn.title && btn.id)
      .map((btn: any) => {
        if (btn.kind === 'phone_number') {
          return {
            type: 'call',
            title: btn.title,
            id: btn.id,
            phone_number: btn.value,
          };
        } else if (btn.kind === 'url') {
          return {
            type: 'url',
            title: btn.title,
            id: btn.id,
            url: btn.value,
          };
        }
        return null;
      })
      .filter(Boolean);
    
    payload.action = { buttons };
    payload.type = 'button';
  }

  // End Node: message.text
  else if (nodeType === 'message.text') {
    // Send simple text message via WHAPI Gate API
    const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
    return await fetch("https://gate.whapi.cloud/messages/text", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
      },
      body: JSON.stringify({
        to: phone,
        body: config.text || 'Thank you!',
      }),
    }).then(res => res.json());
  }

  // End Node: message.media
  else if (nodeType === 'message.media') {
    // Send media message via WHAPI Gate API
    // API expects: POST /messages/{mediaType} (e.g., /messages/document, /messages/image)
    const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
    const mediaType = config.mediaType || 'image'; // image, video, gif, audio, voice, document, sticker
    
    const mediaPayload: any = {
      to: phone,
      media: config.mediaUrl, // Direct URL to media file
    };
    
    if (config.caption) {
      mediaPayload.caption = config.caption;
    }
    
    return await fetch(`https://gate.whapi.cloud/messages/${mediaType}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
      },
      body: JSON.stringify(mediaPayload),
    }).then(res => res.json());
  }

  // End Node: message.location
  else if (nodeType === 'message.location') {
    // Send location message via WHAPI Gate API
    // API expects flat payload with latitude/longitude at root level
    const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
    
    const locationPayload: any = {
      to: phone,
      latitude: parseFloat(config.latitude || '0'),
      longitude: parseFloat(config.longitude || '0'),
    };
    
    // Optional fields - only include if provided
    if (config.name) locationPayload.name = config.name;
    if (config.address) locationPayload.address = config.address;
    
    return await fetch("https://gate.whapi.cloud/messages/location", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
      },
      body: JSON.stringify(locationPayload),
    }).then(res => res.json());
  }

  // Carousel
  else if (nodeType === 'carousel') {
    return await sendCarouselMessage(channelToken, {
      to: phone,
      body: { text: config.bodyText || 'Check out our offerings!' },
      cards: (config.cards || []).map((card: any) => ({
        id: card.id,
        media: { media: card.media },
        text: card.text,
        buttons: (card.buttons || []).map((btn: any) => {
          if (btn.type === 'url') {
            return {
              type: 'url',
              title: btn.title,
              id: btn.id,
              url: btn.url,
            };
          } else {
            return {
              type: 'quick_reply',
              title: btn.title,
              id: btn.id,
            };
          }
        }),
      })),
    });
  }

  else {
    throw new Error(`Unsupported node type: ${nodeType}`);
  }

  // Send the message using WHAPI
  return await sendInteractiveMessage(channelToken, payload);
}
