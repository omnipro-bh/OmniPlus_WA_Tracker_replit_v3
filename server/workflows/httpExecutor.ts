/**
 * HTTP Executor for Workflow HTTP Request Nodes
 * 
 * Handles HTTP requests with variable substitution, authentication,
 * response parsing, and error handling for workflow automation.
 */

import * as ipaddr from 'ipaddr.js';

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
 * Check if an IP address is private/reserved using ipaddr.js
 * This handles all IPv4/IPv6 formats including edge cases like:
 * - IPv4-mapped IPv6 (::ffff:192.168.1.1)
 * - Octal notation (0177.0.0.1)
 * - Integer notation (2130706433)
 */
function isPrivateOrReservedIp(ipString: string): boolean {
  try {
    // Parse and normalize the IP address
    const addr = ipaddr.process(ipString);
    
    // Check IPv4 ranges
    if (addr.kind() === 'ipv4') {
      const range = addr.range();
      
      // Block all private, reserved, and special-use ranges
      const blockedRanges = [
        'unspecified',    // 0.0.0.0/8
        'broadcast',      // 255.255.255.255
        'multicast',      // 224.0.0.0/4
        'linkLocal',      // 169.254.0.0/16
        'loopback',       // 127.0.0.0/8
        'private',        // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
        'reserved',       // Reserved ranges
      ];
      
      if (blockedRanges.includes(range)) {
        return true;
      }
      
      // Additional manual checks for ranges not covered by ipaddr.js
      const octets = addr.octets;
      
      // 100.64.0.0/10 - Shared Address Space (CGN)
      if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) {
        return true;
      }
      
      // 192.0.0.0/24 - IETF Protocol Assignments
      if (octets[0] === 192 && octets[1] === 0 && octets[2] === 0) {
        return true;
      }
      
      // 192.0.2.0/24 - TEST-NET-1
      if (octets[0] === 192 && octets[1] === 0 && octets[2] === 2) {
        return true;
      }
      
      // 192.88.99.0/24 - IPv6 to IPv4 relay
      if (octets[0] === 192 && octets[1] === 88 && octets[2] === 99) {
        return true;
      }
      
      // 198.18.0.0/15 - Benchmark testing
      if (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19)) {
        return true;
      }
      
      // 198.51.100.0/24 - TEST-NET-2
      if (octets[0] === 198 && octets[1] === 51 && octets[2] === 100) {
        return true;
      }
      
      // 203.0.113.0/24 - TEST-NET-3
      if (octets[0] === 203 && octets[1] === 0 && octets[2] === 113) {
        return true;
      }
      
      return false;
    }
    
    // Check IPv6 ranges
    if (addr.kind() === 'ipv6') {
      const range = addr.range();
      
      // Block all private, reserved, and special-use IPv6 ranges
      const blockedRanges = [
        'unspecified',    // ::
        'linkLocal',      // fe80::/10
        'loopback',       // ::1
        'multicast',      // ff00::/8
        'uniqueLocal',    // fc00::/7
        'ipv4Mapped',     // ::ffff:0:0/96 (this catches IPv4-mapped IPv6)
        'reserved',       // Reserved ranges
      ];
      
      if (blockedRanges.includes(range)) {
        return true;
      }
      
      return false;
    }
    
    // Unknown IP kind, block it
    return true;
  } catch (error) {
    // If parsing fails, block it (fail closed)
    console.error('[SSRF Protection] Failed to parse IP:', ipString, error);
    return true;
  }
}

/**
 * Validate URL and resolve to safe IP to prevent SSRF and DNS rebinding
 * Returns the validated IP address to use for the request
 */
async function validateAndResolveUrl(urlString: string): Promise<{ ip: string; hostname: string; protocol: string; port: string }> {
  try {
    const url = new URL(urlString);
    
    // Only allow http and https
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Only HTTP and HTTPS protocols are allowed');
    }
    
    const hostname = url.hostname.toLowerCase();
    const protocol = url.protocol;
    const port = url.port || (protocol === 'https:' ? '443' : '80');
    
    // Block obviously malicious hostnames
    const blockedHostnames = ['localhost', '0.0.0.0'];
    if (blockedHostnames.includes(hostname)) {
      throw new Error('Access to local/private networks is not allowed');
    }
    
    // If hostname is already an IP address, validate it directly
    if (/^[\d.:]+$/.test(hostname)) {
      if (isPrivateOrReservedIp(hostname)) {
        throw new Error('Access to private/reserved IP addresses is not allowed');
      }
      return { ip: hostname, hostname, protocol, port };
    }
    
    // Resolve DNS and validate all resulting IP addresses
    // We'll use the first valid IP for the actual request to prevent DNS rebinding
    const dns = await import('dns');
    const dnsPromises = dns.promises;
    
    let validIp: string | null = null;
    
    // Try IPv4 first
    try {
      const ipv4 = await dnsPromises.resolve4(hostname);
      for (const ip of ipv4) {
        if (!isPrivateOrReservedIp(ip)) {
          validIp = ip;
          break;
        }
      }
    } catch {
      // IPv4 resolution failed or all IPs were private
    }
    
    // If no valid IPv4, try IPv6
    if (!validIp) {
      try {
        const ipv6 = await dnsPromises.resolve6(hostname);
        for (const ip of ipv6) {
          if (!isPrivateOrReservedIp(ip)) {
            validIp = ip;
            break;
          }
        }
      } catch {
        // IPv6 resolution failed or all IPs were private
      }
    }
    
    if (!validIp) {
      throw new Error('Hostname does not resolve to any public IP address');
    }
    
    // Return the validated IP to use for the request
    return { ip: validIp, hostname, protocol, port };
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
    
    // Validate URL and get safe IP to prevent DNS rebinding
    const { ip, hostname, protocol, port } = await validateAndResolveUrl(resolvedUrl);
    
    // Build URL with validated IP instead of hostname to prevent DNS rebinding
    const originalUrl = new URL(resolvedUrl);
    const safePath = originalUrl.pathname + originalUrl.search;
    
    // Construct URL using the validated IP
    let url: URL;
    if (ip.includes(':')) {
      // IPv6 address - wrap in brackets
      url = new URL(`${protocol}//[${ip}]:${port}${safePath}`);
    } else {
      // IPv4 address
      url = new URL(`${protocol}//${ip}:${port}${safePath}`);
    }
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
      // CRITICAL: Set Host header to original hostname (not IP)
      // This ensures servers using virtual hosting work correctly
      'Host': hostname,
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
