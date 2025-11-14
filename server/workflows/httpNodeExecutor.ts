/**
 * HTTP Request Node Executor for Workflows
 * 
 * Handles HTTP Request nodes in workflow execution:
 * - Builds execution context from conversation state
 * - Calls HTTP executor with variable substitution
 * - Stores results in conversation state
 * - Determines next node based on success/error routing
 */

import { performHttpRequest, type HttpRequestConfig, type HttpExecutionContext, type HttpExecutionResult } from './httpExecutor';
import type { ConversationState } from '@shared/schema';

export interface HttpNodeExecutionResult {
  success: boolean;
  nextHandle: 'success' | 'error';
  result: HttpExecutionResult;
  stateUpdate: any;
}

/**
 * Build execution context from conversation state and workflow data
 */
function buildExecutionContext(
  conversationState: ConversationState,
  incomingMessage: any,
  userMetadata: any
): HttpExecutionContext {
  const context: HttpExecutionContext = {
    // User information
    phone: userMetadata.phone || incomingMessage.from || '',
    name: userMetadata.name || '',
    email: userMetadata.email || '',
    
    // Incoming message data
    message: {
      text: incomingMessage.text?.body || '',
      from: incomingMessage.from || '',
      timestamp: incomingMessage.timestamp || Date.now(),
    },
    
    // Conversation state context (includes variables from previous nodes)
    ...((conversationState.context as any) || {}),
  };
  
  return context;
}

/**
 * Execute HTTP Request node
 */
export async function executeHttpNode(
  node: any,
  conversationState: ConversationState,
  incomingMessage: any = {},
  userMetadata: any = {}
): Promise<HttpNodeExecutionResult> {
  try {
    // Extract HTTP config from node
    const config: HttpRequestConfig = {
      method: node.data?.config?.method || 'GET',
      url: node.data?.config?.url || '',
      authType: node.data?.config?.authType || 'none',
      bearerToken: node.data?.config?.bearerToken,
      basicUsername: node.data?.config?.basicUsername,
      basicPassword: node.data?.config?.basicPassword,
      headers: node.data?.config?.headers || [],
      queryParams: node.data?.config?.queryParams || [],
      bodyContentType: node.data?.config?.bodyContentType || 'json',
      body: node.data?.config?.body,
      responseMapping: node.data?.config?.responseMapping || [],
      timeout: node.data?.config?.timeout,
    };
    
    // Build execution context
    const executionContext = buildExecutionContext(conversationState, incomingMessage, userMetadata);
    
    // Execute HTTP request
    const result = await performHttpRequest(config, executionContext);
    
    // Prepare state update to store in conversation state
    const stateUpdate = {
      status: result.status,
      statusText: result.statusText,
      data: result.data,
      mappedVariables: result.mappedVariables || {},
      error: result.error,
      executedAt: new Date().toISOString(),
    };
    
    // Determine next handle based on success
    const nextHandle = result.success ? 'success' : 'error';
    
    // Merge mapped variables into context root for easy access
    const contextUpdate: any = {
      ...(conversationState.context as any),
    };
    
    // Store HTTP response under http[nodeId]
    contextUpdate.http = contextUpdate.http || {};
    contextUpdate.http[node.id] = stateUpdate;
    
    // Merge mapped variables into root context for {{variable}} access
    if (result.mappedVariables) {
      Object.assign(contextUpdate, result.mappedVariables);
    }
    
    return {
      success: result.success,
      nextHandle,
      result,
      stateUpdate: contextUpdate,
    };
  } catch (error: any) {
    console.error('[HTTP Node Executor] Execution failed:', error);
    
    // Build error state update
    const errorStateUpdate = {
      error: error.message || 'HTTP request execution failed',
      executedAt: new Date().toISOString(),
    };
    
    const contextUpdate: any = {
      ...(conversationState.context as any),
    };
    
    contextUpdate.http = contextUpdate.http || {};
    contextUpdate.http[node.id] = errorStateUpdate;
    
    return {
      success: false,
      nextHandle: 'error',
      result: {
        success: false,
        error: error.message || 'Execution failed',
      },
      stateUpdate: contextUpdate,
    };
  }
}

/**
 * Get next node by following a specific handle from current node
 */
export function getNextNodeByHandle(
  currentNodeId: string,
  handleType: 'success' | 'error' | string,
  edges: any[]
): string | null {
  // Find edge from current node's specific handle
  const edge = edges.find((e: any) => 
    e.source === currentNodeId && 
    (e.sourceHandle === handleType || e.sourceHandle === `${currentNodeId}-${handleType}`)
  );
  
  return edge?.target || null;
}
