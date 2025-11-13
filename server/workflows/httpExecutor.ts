/**
 * HTTP Executor for Workflow HTTP Request Nodes
 * 
 * Handles HTTP requests with variable substitution, authentication,
 * response parsing, and error handling for workflow automation.
 */

export interface HttpRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  authType?: 'none' | 'bearer' | 'basic';
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  headers?: Array<{ name: string; value: string }>;
  queryParams?: Array<{ name: string; value: string }>;
  bodyContentType?: 'json' | 'form';
  body?: string;
  responseMapping?: Array<{ jsonPath: string; variableName: string }>;
  timeout?: number | string;
}

export interface HttpExecutionContext {
  [key: string]: any;
}

export interface HttpExecutionResult {
  success: boolean;
  status?: number;
  statusText?: string;
  data?: any;
  mappedVariables?: Record<string, any>;
  error?: string;
  rawResponse?: string;
}

/**
 * Resolve template variables like {{variableName}} or {{path.to.value}}
 */
export function resolveTemplate(template: string, context: HttpExecutionContext): string {
  if (!template) return '';
  
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const trimmedPath = path.trim();
    const value = getNestedValue(context, trimmedPath);
    return value !== undefined && value !== null ? String(value) : '';
  });
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  if (!path) return obj;
  
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    // Handle array indices like data[0]
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const key = arrayMatch[1];
      const index = parseInt(arrayMatch[2]);
      current = current?.[key]?.[index];
    } else {
      current = current?.[part];
    }
    
    if (current === undefined || current === null) {
      return undefined;
    }
  }
  
  return current;
}

/**
 * Resolve all variables in an object recursively
 */
export function resolveObject(obj: any, context: HttpExecutionContext): any {
  if (typeof obj === 'string') {
    return resolveTemplate(obj, context);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => resolveObject(item, context));
  }
  if (obj && typeof obj === 'object') {
    const resolved: any = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveObject(value, context);
    }
    return resolved;
  }
  return obj;
}

/**
 * Validate URL to prevent SSRF attacks
 */
function validateUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    
    // Only allow http and https
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Only HTTP and HTTPS protocols are allowed');
    }
    
    // Block localhost, private IPs, and reserved ranges
    const hostname = url.hostname.toLowerCase();
    const blockedPatterns = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      /^10\./,          // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16.0.0/12
      /^192\.168\./,    // 192.168.0.0/16
      /^169\.254\./,    // Link-local
    ];
    
    for (const pattern of blockedPatterns) {
      if (typeof pattern === 'string') {
        if (hostname === pattern || hostname.endsWith(`.${pattern}`)) {
          throw new Error('Access to local/private networks is not allowed');
        }
      } else if (pattern.test(hostname)) {
        throw new Error('Access to local/private networks is not allowed');
      }
    }
    
    return true;
  } catch (error: any) {
    throw new Error(`Invalid URL: ${error.message}`);
  }
}

/**
 * Perform HTTP request with configuration
 */
export async function performHttpRequest(
  config: HttpRequestConfig,
  context: HttpExecutionContext
): Promise<HttpExecutionResult> {
  try {
    // Resolve URL with variables
    const resolvedUrl = resolveTemplate(config.url, context);
    
    // Validate URL for security
    validateUrl(resolvedUrl);
    
    // Build URL with query parameters
    const url = new URL(resolvedUrl);
    if (config.queryParams) {
      for (const param of config.queryParams) {
        if (param.name && param.value) {
          const resolvedValue = resolveTemplate(param.value, context);
          url.searchParams.append(param.name, resolvedValue);
        }
      }
    }
    
    // Build headers
    const headers: Record<string, string> = {
      'User-Agent': 'OmniPlus-Workflow/1.0',
    };
    
    // Add authentication headers
    if (config.authType === 'bearer' && config.bearerToken) {
      const resolvedToken = resolveTemplate(config.bearerToken, context);
      headers['Authorization'] = `Bearer ${resolvedToken}`;
    } else if (config.authType === 'basic' && config.basicUsername && config.basicPassword) {
      const username = resolveTemplate(config.basicUsername, context);
      const password = resolveTemplate(config.basicPassword, context);
      const credentials = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }
    
    // Add custom headers
    if (config.headers) {
      for (const header of config.headers) {
        if (header.name && header.value) {
          const resolvedValue = resolveTemplate(header.value, context);
          headers[header.name] = resolvedValue;
        }
      }
    }
    
    // Build request body for POST/PUT/PATCH
    let body: string | undefined;
    if (['POST', 'PUT', 'PATCH'].includes(config.method) && config.body) {
      const resolvedBody = resolveTemplate(config.body, context);
      
      if (config.bodyContentType === 'json') {
        headers['Content-Type'] = 'application/json';
        // Validate JSON
        try {
          JSON.parse(resolvedBody);
          body = resolvedBody;
        } catch {
          throw new Error('Invalid JSON in request body');
        }
      } else if (config.bodyContentType === 'form') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = resolvedBody;
      } else {
        headers['Content-Type'] = 'application/json';
        body = resolvedBody;
      }
    }
    
    // Set timeout (default 30 seconds)
    const timeoutMs = typeof config.timeout === 'string' 
      ? parseInt(config.timeout) * 1000 
      : (config.timeout || 30) * 1000;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      // Perform HTTP request
      console.log(`[HTTP Executor] ${config.method} ${url.toString()}`);
      const response = await fetch(url.toString(), {
        method: config.method,
        headers,
        body,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const status = response.status;
      const statusText = response.statusText;
      const contentType = response.headers.get('content-type') || '';
      
      // Read response body
      const rawResponse = await response.text();
      
      // Parse JSON if content-type is JSON
      let data: any = rawResponse;
      if (contentType.includes('application/json') && rawResponse) {
        try {
          data = JSON.parse(rawResponse);
        } catch {
          console.warn('[HTTP Executor] Failed to parse JSON response, using raw text');
        }
      }
      
      // Check if response is successful (2xx)
      const success = status >= 200 && status < 300;
      
      // Apply response mapping if provided and successful
      const mappedVariables: Record<string, any> = {};
      if (success && config.responseMapping && typeof data === 'object') {
        for (const mapping of config.responseMapping) {
          if (mapping.jsonPath && mapping.variableName) {
            const value = getNestedValue(data, mapping.jsonPath);
            if (value !== undefined) {
              mappedVariables[mapping.variableName] = value;
            }
          }
        }
      }
      
      return {
        success,
        status,
        statusText,
        data,
        mappedVariables,
        rawResponse,
        error: success ? undefined : `HTTP ${status}: ${statusText}`,
      };
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs / 1000}s`);
      }
      throw fetchError;
    }
  } catch (error: any) {
    console.error('[HTTP Executor] Error:', error);
    return {
      success: false,
      error: error.message || String(error),
    };
  }
}
