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
  
  console.log(`[WHAPI SEND] Sending interactive message to ${payload.to}`);
  console.log(`[WHAPI SEND] Payload type: ${payload.type}`);
  if (payload.action?.buttons) {
    console.log(`[WHAPI SEND] Buttons being sent:`, JSON.stringify(payload.action.buttons, null, 2));
  }
  
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
      statusText: response.statusText,
      errorText: errorText.substring(0, 1000),
      errorData: JSON.stringify(errorData),
      payloadSent: JSON.stringify(payload, null, 2).substring(0, 500)
    });
    
    // Properly extract error message - handle nested objects
    let errorMessage = `WHAPI send failed (status ${response.status})`;
    if (errorData?.error?.message && typeof errorData.error.message === 'string') {
      errorMessage = errorData.error.message;
    } else if (errorData?.error && typeof errorData.error === 'string') {
      errorMessage = errorData.error;
    } else if (errorData?.error && typeof errorData.error === 'object') {
      // Stringify object errors to avoid [object Object]
      errorMessage = JSON.stringify(errorData.error);
    } else if (errorData?.message && typeof errorData.message === 'string') {
      errorMessage = errorData.message;
    } else if (errorData?.rawError && typeof errorData.rawError === 'string') {
      errorMessage = errorData.rawError;
    }
    throw new Error(errorMessage);
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

// ============================================================================
// LABEL MANAGEMENT API FUNCTIONS
// ============================================================================

export interface WhapiLabel {
  id: string;
  name: string;
  color?: string;
}

// Get all labels from WhatsApp account
export async function getLabels(channelToken: string): Promise<WhapiLabel[]> {
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  
  try {
    const response = await fetch("https://gate.whapi.cloud/api/labels", {
      method: "GET",
      headers: {
        "Authorization": authToken,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[WHAPI Labels] Failed to get labels:`, errorText);
      return [];
    }

    const data = await response.json();
    return data.labels || data || [];
  } catch (error: any) {
    console.error(`[WHAPI Labels] Error getting labels:`, error.message);
    return [];
  }
}

// Create a new label with specific ID
export async function createLabel(
  channelToken: string, 
  name: string, 
  color: string, 
  labelId: string,
  logContext?: { userId: number; channelId?: number; labelType?: string }
): Promise<WhapiLabel | null> {
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  
  // WHAPI requires ID to match pattern ^([\d]{1,2})?$ (1-2 digit number)
  const payload: any = { id: labelId, name, color };
  let responseData: any = null;
  let responseText = "";

  try {
    console.log(`[WHAPI Labels] Creating label with payload:`, JSON.stringify(payload));

    const response = await fetch("https://gate.whapi.cloud/api/labels", {
      method: "POST",
      headers: {
        "Authorization": authToken,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    responseText = await response.text();
    console.log(`[WHAPI Labels] Create response status: ${response.status}, body: ${responseText}`);

    if (!response.ok) {
      console.error(`[WHAPI Labels] Failed to create label "${name}" with ID ${labelId}`);
      
      // Log to database if context provided (fire-and-forget, never block)
      if (logContext) {
        try {
          await storage.createLabelLog({
            userId: logContext.userId,
            channelId: logContext.channelId,
            operation: "create",
            labelType: logContext.labelType,
            labelId: labelId,
            labelName: name,
            status: "error",
            requestPayload: payload,
            responseData: { status: response.status, body: responseText },
            errorMessage: responseText,
          });
        } catch (logErr: any) {
          console.error(`[WHAPI Labels] Failed to log create error:`, logErr.message);
        }
      }
      return null;
    }

    try {
      responseData = JSON.parse(responseText);
      console.log(`[WHAPI Labels] Label created successfully:`, JSON.stringify(responseData));
    } catch {
      // If response is not JSON but status is OK, return a mock object with the ID we sent
      responseData = { id: labelId, name, color };
    }
    
    // Log success to database if context provided (fire-and-forget, never block)
    if (logContext) {
      try {
        await storage.createLabelLog({
          userId: logContext.userId,
          channelId: logContext.channelId,
          operation: "create",
          labelType: logContext.labelType,
          labelId: labelId,
          labelName: name,
          status: "success",
          requestPayload: payload,
          responseData: responseData,
        });
      } catch (logErr: any) {
        console.error(`[WHAPI Labels] Failed to log create success:`, logErr.message);
      }
    }
    
    return responseData;
  } catch (error: any) {
    console.error(`[WHAPI Labels] Error creating label:`, error.message);
    
    // Log error to database if context provided (fire-and-forget, never block)
    if (logContext) {
      try {
        await storage.createLabelLog({
          userId: logContext.userId,
          channelId: logContext.channelId,
          operation: "create",
          labelType: logContext.labelType,
          labelId: labelId,
          labelName: name,
          status: "error",
          requestPayload: payload,
          errorMessage: error.message,
        });
      } catch (logErr: any) {
        console.error(`[WHAPI Labels] Failed to log create error:`, logErr.message);
      }
    }
    return null;
  }
}

// Find the next available label ID that doesn't conflict with existing labels
// WHAPI allows IDs from 1-99 (1-2 digit numbers)
function findNextAvailableLabelId(existingLabels: WhapiLabel[]): string {
  const existingIds = new Set(existingLabels.map(l => parseInt(l.id, 10)).filter(n => !isNaN(n)));
  // Find any available ID from 1-99
  for (let id = 1; id <= 99; id++) {
    if (!existingIds.has(id)) {
      return String(id);
    }
  }
  // Fallback (should never happen - 99 labels is a lot)
  return String(99);
}

// Assign a label to a chat (fire-and-forget for performance)
export async function assignLabelToChat(
  channelToken: string, 
  labelId: string, 
  chatId: string,
  logContext?: { userId: number; channelId?: number; labelType?: string; labelName?: string }
): Promise<boolean> {
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  
  try {
    const response = await fetch(`https://gate.whapi.cloud/api/labels/${labelId}/${chatId}`, {
      method: "POST",
      headers: {
        "Authorization": authToken,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[WHAPI Labels] Failed to assign label ${labelId} to chat ${chatId}:`, errorText);
      
      // Log error to database if context provided (fire-and-forget, never block)
      if (logContext) {
        try {
          await storage.createLabelLog({
            userId: logContext.userId,
            channelId: logContext.channelId,
            operation: "assign",
            labelType: logContext.labelType,
            labelId: labelId,
            labelName: logContext.labelName,
            chatId: chatId,
            status: "error",
            requestPayload: { labelId, chatId },
            errorMessage: errorText,
          });
        } catch (logErr: any) {
          console.error(`[WHAPI Labels] Failed to log assign error:`, logErr.message);
        }
      }
      return false;
    }

    console.log(`[WHAPI Labels] Successfully assigned label ${labelId} to chat ${chatId}`);
    
    // Log success to database if context provided (fire-and-forget, never block)
    if (logContext) {
      try {
        await storage.createLabelLog({
          userId: logContext.userId,
          channelId: logContext.channelId,
          operation: "assign",
          labelType: logContext.labelType,
          labelId: labelId,
          labelName: logContext.labelName,
          chatId: chatId,
          status: "success",
          requestPayload: { labelId, chatId },
        });
      } catch (logErr: any) {
        console.error(`[WHAPI Labels] Failed to log assign success:`, logErr.message);
      }
    }
    return true;
  } catch (error: any) {
    console.error(`[WHAPI Labels] Error assigning label:`, error.message);
    
    // Log error to database if context provided (fire-and-forget, never block)
    if (logContext) {
      try {
        await storage.createLabelLog({
          userId: logContext.userId,
          channelId: logContext.channelId,
          operation: "assign",
          labelType: logContext.labelType,
          labelId: labelId,
          labelName: logContext.labelName,
          chatId: chatId,
          status: "error",
          requestPayload: { labelId, chatId },
          errorMessage: error.message,
        });
      } catch (logErr: any) {
        console.error(`[WHAPI Labels] Failed to log assign error:`, logErr.message);
      }
    }
    return false;
  }
}

// Remove a label from a chat (fire-and-forget for performance)
export async function removeLabelFromChat(
  channelToken: string, 
  labelId: string, 
  chatId: string,
  logContext?: { userId: number; channelId?: number; labelType?: string; labelName?: string }
): Promise<boolean> {
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  
  try {
    const response = await fetch(`https://gate.whapi.cloud/api/labels/${labelId}/${chatId}`, {
      method: "DELETE",
      headers: {
        "Authorization": authToken,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      // Don't log error if label wasn't assigned (expected behavior)
      if (!errorText.includes("not found") && !errorText.includes("not assigned")) {
        console.error(`[WHAPI Labels] Failed to remove label ${labelId} from chat ${chatId}:`, errorText);
        
        // Log error to database if context provided (fire-and-forget, never block)
        if (logContext) {
          try {
            await storage.createLabelLog({
              userId: logContext.userId,
              channelId: logContext.channelId,
              operation: "remove",
              labelType: logContext.labelType,
              labelId: labelId,
              labelName: logContext.labelName,
              chatId: chatId,
              status: "error",
              requestPayload: { labelId, chatId },
              errorMessage: errorText,
            });
          } catch (logErr: any) {
            console.error(`[WHAPI Labels] Failed to log remove error:`, logErr.message);
          }
        }
      }
      return false;
    }

    console.log(`[WHAPI Labels] Successfully removed label ${labelId} from chat ${chatId}`);
    
    // Log success to database if context provided (fire-and-forget, never block)
    if (logContext) {
      try {
        await storage.createLabelLog({
          userId: logContext.userId,
          channelId: logContext.channelId,
          operation: "remove",
          labelType: logContext.labelType,
          labelId: labelId,
          labelName: logContext.labelName,
          chatId: chatId,
          status: "success",
          requestPayload: { labelId, chatId },
        });
      } catch (logErr: any) {
        console.error(`[WHAPI Labels] Failed to log remove success:`, logErr.message);
      }
    }
    return true;
  } catch (error: any) {
    console.error(`[WHAPI Labels] Error removing label:`, error.message);
    
    // Log error to database if context provided (fire-and-forget, never block)
    if (logContext) {
      try {
        await storage.createLabelLog({
          userId: logContext.userId,
          channelId: logContext.channelId,
          operation: "remove",
          labelType: logContext.labelType,
          labelId: labelId,
          labelName: logContext.labelName,
          chatId: chatId,
          status: "error",
          requestPayload: { labelId, chatId },
          errorMessage: error.message,
        });
      } catch (logErr: any) {
        console.error(`[WHAPI Labels] Failed to log remove error:`, logErr.message);
      }
    }
    return false;
  }
}

// Async label management helper - handles the swap logic without blocking
// This is the main function to call from webhook/message handlers
export function manageChatLabelAsync(
  channelToken: string,
  chatId: string,
  labelType: 'chatbot' | 'inquiry',
  chatbotLabelId: string | null,
  inquiryLabelId: string | null,
  logContext?: { userId: number; channelId?: number; chatbotLabelName?: string; inquiryLabelName?: string }
): void {
  // Fire and forget - don't await to avoid blocking the response
  Promise.resolve().then(async () => {
    try {
      const baseLogContext = logContext ? { userId: logContext.userId, channelId: logContext.channelId } : undefined;
      const chatbotLabelName = logContext?.chatbotLabelName || 'Chatbot';
      const inquiryLabelName = logContext?.inquiryLabelName || 'Inquiries';
      
      if (labelType === 'chatbot' && chatbotLabelId) {
        // Remove inquiry label if exists, then assign chatbot label
        if (inquiryLabelId) {
          await removeLabelFromChat(channelToken, inquiryLabelId, chatId, 
            baseLogContext ? { ...baseLogContext, labelType: 'inquiry', labelName: inquiryLabelName } : undefined);
        }
        await assignLabelToChat(channelToken, chatbotLabelId, chatId,
          baseLogContext ? { ...baseLogContext, labelType: 'chatbot', labelName: chatbotLabelName } : undefined);
      } else if (labelType === 'inquiry' && inquiryLabelId) {
        // Remove chatbot label if exists, then assign inquiry label
        if (chatbotLabelId) {
          await removeLabelFromChat(channelToken, chatbotLabelId, chatId,
            baseLogContext ? { ...baseLogContext, labelType: 'chatbot', labelName: chatbotLabelName } : undefined);
        }
        await assignLabelToChat(channelToken, inquiryLabelId, chatId,
          baseLogContext ? { ...baseLogContext, labelType: 'inquiry', labelName: inquiryLabelName } : undefined);
      }
    } catch (error: any) {
      console.error(`[WHAPI Labels] manageChatLabelAsync error:`, error.message);
    }
  });
}

// Initialize labels for a user's WhatsApp account
export async function initializeUserLabels(
  channelToken: string,
  chatbotLabelName: string = "Chatbot",
  inquiryLabelName: string = "Inquiries",
  logContext?: { userId: number; channelId?: number }
): Promise<{ chatbotLabelId: string | null; inquiryLabelId: string | null }> {
  console.log(`[WHAPI Labels] initializeUserLabels called with chatbot="${chatbotLabelName}", inquiry="${inquiryLabelName}"`);
  
  try {
    // Get existing labels
    console.log(`[WHAPI Labels] Fetching existing labels...`);
    const existingLabels = await getLabels(channelToken);
    console.log(`[WHAPI Labels] Found ${existingLabels.length} existing labels:`, existingLabels.map(l => ({ id: l.id, name: l.name })));
    
    let chatbotLabelId: string | null = null;
    let inquiryLabelId: string | null = null;

    // Find or create chatbot label
    const existingChatbotLabel = existingLabels.find(
      l => l.name.toLowerCase() === chatbotLabelName.toLowerCase()
    );
    if (existingChatbotLabel) {
      console.log(`[WHAPI Labels] Found existing chatbot label: ${existingChatbotLabel.id}`);
      chatbotLabelId = existingChatbotLabel.id;
    } else {
      // Find the next available ID that doesn't conflict with existing labels
      const nextId = findNextAvailableLabelId(existingLabels);
      console.log(`[WHAPI Labels] Creating new chatbot label "${chatbotLabelName}" with ID ${nextId} and color limegreen...`);
      // Valid WHAPI colors: salmon, lightskyblue, gold, plum, silver, mediumturquoise, violet, goldenrod, cornflowerblue, greenyellow, cyan, lightpink, mediumaquamarine, orangered, deepskyblue, limegreen, darkorange, lightsteelblue, mediumpurple, rebeccapurple
      const newLabel = await createLabel(channelToken, chatbotLabelName, "limegreen", nextId,
        logContext ? { ...logContext, labelType: 'chatbot' } : undefined);
      console.log(`[WHAPI Labels] Create chatbot label result:`, newLabel);
      if (newLabel) {
        chatbotLabelId = newLabel.id;
        // Add to existing labels to avoid ID conflict with inquiry label
        existingLabels.push(newLabel);
      }
    }

    // Find or create inquiry label
    const existingInquiryLabel = existingLabels.find(
      l => l.name.toLowerCase() === inquiryLabelName.toLowerCase()
    );
    if (existingInquiryLabel) {
      console.log(`[WHAPI Labels] Found existing inquiry label: ${existingInquiryLabel.id}`);
      inquiryLabelId = existingInquiryLabel.id;
    } else {
      // Find the next available ID (after chatbot label was potentially created)
      const nextId = findNextAvailableLabelId(existingLabels);
      console.log(`[WHAPI Labels] Creating new inquiry label "${inquiryLabelName}" with ID ${nextId} and color gold...`);
      const newLabel = await createLabel(channelToken, inquiryLabelName, "gold", nextId,
        logContext ? { ...logContext, labelType: 'inquiry' } : undefined);
      console.log(`[WHAPI Labels] Create inquiry label result:`, newLabel);
      if (newLabel) inquiryLabelId = newLabel.id;
    }

    console.log(`[WHAPI Labels] Final result - chatbotLabelId: ${chatbotLabelId}, inquiryLabelId: ${inquiryLabelId}`);
    
    // Log sync success after all operations complete (fire-and-forget, never block)
    if (logContext) {
      try {
        await storage.createLabelLog({
          userId: logContext.userId,
          channelId: logContext.channelId,
          operation: "sync",
          status: "success",
          requestPayload: { chatbotLabelName, inquiryLabelName },
          responseData: { chatbotLabelId, inquiryLabelId },
        });
      } catch (logErr: any) {
        console.error(`[WHAPI Labels] Failed to log sync success:`, logErr.message);
      }
    }
    
    return { chatbotLabelId, inquiryLabelId };
  } catch (error: any) {
    console.error(`[WHAPI Labels] Error initializing user labels:`, error.message);
    
    // Log sync error (fire-and-forget, never block)
    if (logContext) {
      try {
        await storage.createLabelLog({
          userId: logContext.userId,
          channelId: logContext.channelId,
          operation: "sync",
          status: "error",
          requestPayload: { chatbotLabelName, inquiryLabelName },
          errorMessage: error.message,
        });
      } catch (logErr: any) {
        console.error(`[WHAPI Labels] Failed to log sync error:`, logErr.message);
      }
    }
    
    return { chatbotLabelId: null, inquiryLabelId: null };
  }
}
