/**
 * Simplified Secure HTTP Executor for Workflow HTTP Request Nodes
 * 
 * Security Model:
 * - HTTPS-only (no HTTP)
 * - Domain allowlist validation
 * - No redirect following
 * - 5MB response size limit
 * - 10s default timeout
 * - For trusted APIs only
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
 * Apply template resolution to all values in an object
 */
function resolveObject(obj: any, context: HttpExecutionContext): any {
  if (typeof obj === 'string') {
    return resolveTemplate(obj, context);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => resolveObject(item, context));
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const key in obj) {
      result[key] = resolveObject(obj[key], context);
    }
    return result;
  }
  return obj;
}

/**
 * Validate URL against security requirements
 */
function validateUrl(urlString: string, allowedDomains: string[]): void {
  try {
    const url = new URL(urlString);
    
    // HTTPS-only enforcement
    if (url.protocol !== 'https:') {
      throw new Error('Only HTTPS URLs are allowed for security. Please use https:// instead of http://');
    }
    
    // Domain allowlist validation - REQUIRED
    if (allowedDomains.length === 0) {
      throw new Error('HTTP Request nodes are disabled. Admin must configure allowed domains in Admin → Settings → HTTP Request Allowlist before using this feature.');
    }
    
    const hostname = url.hostname.toLowerCase();
    
    // Check if hostname matches any allowed domain
    const isAllowed = allowedDomains.some(domain => {
      const normalizedDomain = domain.toLowerCase().trim();
      // Exact match or subdomain match
      return hostname === normalizedDomain || hostname.endsWith('.' + normalizedDomain);
    });
    
    if (!isAllowed) {
      throw new Error(`Domain "${hostname}" is not in the allowlist. Allowed domains: ${allowedDomains.join(', ')}`);
    }
  } catch (error: any) {
    if (error.message.includes('Invalid URL')) {
      throw new Error('Invalid URL format. Please check the URL syntax.');
    }
    throw error;
  }
}

/**
 * Extract mapped variables from response data
 */
function extractMappedVariables(
  data: any,
  responseMapping?: Array<{ jsonPath: string; variableName: string }>
): Record<string, any> {
  const variables: Record<string, any> = {};
  
  if (!responseMapping || responseMapping.length === 0) {
    return variables;
  }
  
  for (const mapping of responseMapping) {
    if (!mapping.jsonPath || !mapping.variableName) continue;
    
    try {
      // Simple JSON path resolution (supports dot notation)
      const value = getNestedValue(data, mapping.jsonPath);
      if (value !== undefined && value !== null) {
        variables[mapping.variableName] = value;
      }
    } catch {
      // Silently skip invalid paths
    }
  }
  
  return variables;
}

/**
 * Load allowed domains from settings
 */
async function loadAllowedDomains(): Promise<string[]> {
  try {
    // Dynamic import to avoid circular dependencies
    const { storage } = await import('../storage');
    const setting = await storage.getSetting("http_allowed_domains");
    return setting?.value ? JSON.parse(setting.value) : [];
  } catch (error) {
    console.error('[HTTP Executor] Failed to load allowed domains:', error);
    return [];
  }
}

/**
 * Perform HTTP request with simplified security controls
 */
export async function performHttpRequest(
  config: HttpRequestConfig,
  context: HttpExecutionContext
): Promise<HttpExecutionResult> {
  const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB limit
  const DEFAULT_TIMEOUT = 10000; // 10 seconds
  
  try {
    // Load allowed domains from settings
    const allowedDomains = await loadAllowedDomains();
    
    // Resolve URL with variables
    const resolvedUrl = resolveTemplate(config.url, context);
    
    // Validate URL against security requirements
    validateUrl(resolvedUrl, allowedDomains);
    
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
      const resolvedUsername = resolveTemplate(config.basicUsername, context);
      const resolvedPassword = resolveTemplate(config.basicPassword, context);
      const credentials = Buffer.from(`${resolvedUsername}:${resolvedPassword}`).toString('base64');
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
    
    // Build request body
    let body: string | undefined;
    if (config.body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
      const resolvedBody = resolveTemplate(config.body, context);
      
      if (config.bodyContentType === 'json') {
        headers['Content-Type'] = 'application/json';
        // Validate JSON
        try {
          JSON.parse(resolvedBody);
          body = resolvedBody;
        } catch {
          throw new Error('Request body is not valid JSON');
        }
      } else {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = resolvedBody;
      }
    }
    
    // Parse timeout
    const timeout = typeof config.timeout === 'string' 
      ? parseInt(config.timeout) 
      : (config.timeout || DEFAULT_TIMEOUT);
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      // Perform HTTP request with security controls
      const response = await fetch(url.toString(), {
        method: config.method,
        headers,
        body,
        redirect: 'manual', // CRITICAL: Disable redirects for security
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // Check for redirect response (should never follow)
      if (response.status >= 300 && response.status < 400) {
        return {
          success: false,
          status: response.status,
          statusText: response.statusText,
          error: 'HTTP redirects are not supported for security reasons. Please use the final URL directly.',
        };
      }
      
      // Read response with size limit
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
        return {
          success: false,
          status: response.status,
          statusText: response.statusText,
          error: `Response size (${contentLength} bytes) exceeds 5MB limit`,
        };
      }
      
      // Read response body
      const rawResponse = await response.text();
      
      // Check size after reading
      if (rawResponse.length > MAX_RESPONSE_SIZE) {
        return {
          success: false,
          status: response.status,
          statusText: response.statusText,
          error: `Response size (${rawResponse.length} bytes) exceeds 5MB limit`,
        };
      }
      
      // Parse response data
      let data: any;
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(rawResponse);
        } catch {
          data = rawResponse;
        }
      } else {
        data = rawResponse;
      }
      
      // Extract mapped variables
      const mappedVariables = extractMappedVariables(data, config.responseMapping);
      
      // Determine success based on status code
      const success = response.status >= 200 && response.status < 300;
      
      return {
        success,
        status: response.status,
        statusText: response.statusText,
        data,
        mappedVariables,
        rawResponse,
      };
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return {
          success: false,
          error: `Request timeout after ${timeout}ms`,
        };
      }
      
      throw fetchError;
    }
  } catch (error: any) {
    console.error('[HTTP Executor] Request failed:', error);
    
    return {
      success: false,
      error: error.message || 'HTTP request failed',
    };
  }
}
