/**
 * Tool Helpers
 *
 * Shared error handling wrapper for all MCP tool handlers.
 * Converts exceptions into structured MCP error responses.
 */
import { AuthError, SubscriptionError, ApiError } from '../types.js';

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

const MAX_RESPONSE_BYTES = 50 * 1024; // 50 KB

/**
 * Truncates large arrays in a data object to maxItems and appends a count note.
 * Recurses one level into plain objects to catch nested arrays (depth-limited to 2).
 */
function truncateLargeArrays(data: unknown, maxItems = 50, depth = 0): unknown {
  if (data === null || typeof data !== 'object' || depth > 2) return data;
  // Handle root-level arrays
  if (Array.isArray(data) && data.length > maxItems) {
    return [...data.slice(-maxItems), { _note: `Truncated from ${data.length} to ${maxItems} items.` }];
  }
  if (Array.isArray(data)) return data;
  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) && value.length > maxItems) {
      result[key] = value.slice(-maxItems);
      result[`_${key}_note`] = `Truncated from ${value.length} to ${maxItems} items. Request specific date range or fields for full data.`;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && depth < 2) {
      result[key] = truncateLargeArrays(value, maxItems, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function aggressivelyTrimLargeArrays(data: unknown, maxItems = 5): unknown {
  if (Array.isArray(data) && data.length > maxItems) {
    return [
      ...data.slice(-maxItems),
      { _note: `Aggressively trimmed to most recent ${maxItems} items due to size. Request specific filters for full data.` },
    ];
  }
  if (data === null || typeof data !== 'object') return data;
  const obj = data as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) && value.length > maxItems) {
      obj[key] = value.slice(-maxItems);
      obj[`_${key}_note`] = `Aggressively trimmed to most recent ${maxItems} items due to size. Request specific filters for full data.`;
    }
  }
  return obj;
}

export function applyResponseSizeGuard(data: unknown, maxResponseBytes = MAX_RESPONSE_BYTES): string {
  let json = JSON.stringify(data);
  if (json.length <= maxResponseBytes) return json;

  let processed = truncateLargeArrays(data);
  json = JSON.stringify(processed);

  if (json.length > maxResponseBytes) {
    processed = aggressivelyTrimLargeArrays(processed);
    json = JSON.stringify(processed);
  }

  if (json.length > maxResponseBytes) {
    json = JSON.stringify({
      _error: 'Response too large. Use specific filters (symbol, date range, limit) to narrow results.',
      _size: `${Math.round(json.length / 1024)}KB`,
    });
  }

  return json;
}

/**
 * Wraps a tool handler function with standard error handling.
 * Returns JSON data on success, human-readable error on failure.
 * Applies response size guard unless the handler signals to skip it
 * by returning { _skipSizeGuard: true, data: ... }.
 */
export function toolHandler<T extends Record<string, unknown>>(
  fn: (args: T) => Promise<unknown>,
  opts?: { isSyncTool?: boolean },
): (args: T) => Promise<ToolResult> {
  return async (args: T): Promise<ToolResult> => {
    try {
      let data = await fn(args);
      if (data == null) {
        return { content: [{ type: 'text', text: 'No data available for this query.' }] };
      }

      // Check if the handler opted out of the size guard
      let skipGuard = false;
      if (typeof data === 'object' && data !== null && (data as any)?._skipSizeGuard === true) {
        skipGuard = true;
        data = (data as any).data;
      }

      // Handle empty response — sync tools get a specific message
      if (typeof data === 'object' && 'data' in (data as any) && Array.isArray((data as any).data) && (data as any).data.length === 0) {
        const msg = opts?.isSyncTool
          ? 'No data found. Make sure MCP sync is enabled in the platform\'s Account Settings. Data syncs automatically as you use the platform.'
          : 'No data available for this query.';
        return { content: [{ type: 'text', text: msg }] };
      }

      let json: string;
      if (skipGuard) {
        // Full mode — compact JSON to minimize token usage
        json = JSON.stringify(data);
      } else {
        json = applyResponseSizeGuard(data);
      }

      return {
        content: [{ type: 'text', text: json }],
      };
    } catch (err: any) {
      if (err instanceof AuthError) {
        return {
          content: [{ type: 'text', text: err.message }],
          isError: true,
        };
      }
      if (err instanceof SubscriptionError) {
        return {
          content: [{ type: 'text', text: err.message }],
          isError: true,
        };
      }
      if (err instanceof ApiError) {
        return {
          content: [{ type: 'text', text: `API error: ${err.message}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error: ${err.message || 'Unknown error'}` }],
        isError: true,
      };
    }
  };
}
