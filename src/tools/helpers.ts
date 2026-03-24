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

/**
 * Truncates large arrays in a data object to maxItems and appends a count note.
 * Operates on top-level array values only (shallow).
 */
function truncateLargeArrays(data: unknown, maxItems = 50): unknown {
  if (data === null || typeof data !== 'object') return data;
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
    } else {
      result[key] = value;
    }
  }
  return result;
}

const MAX_RESPONSE_BYTES = 50 * 1024; // 50 KB

/**
 * Wraps a tool handler function with standard error handling.
 * Returns JSON data on success, human-readable error on failure.
 * Applies response size guard: truncates large arrays and prepends a note if over 50 KB.
 */
export function toolHandler<T extends Record<string, unknown>>(
  fn: (args: T) => Promise<unknown>,
): (args: T) => Promise<ToolResult> {
  return async (args: T): Promise<ToolResult> => {
    try {
      const data = await fn(args);
      if (data == null) {
        return { content: [{ type: 'text', text: 'No data available for this query.' }] };
      }
      // Handle sync endpoint empty response
      if (typeof data === 'object' && 'data' in (data as any) && Array.isArray((data as any).data) && (data as any).data.length === 0) {
        return { content: [{ type: 'text', text: 'No data found. If this is user analysis data, make sure MCP sync is enabled in the platform\'s Account Settings. Data syncs automatically as you use the platform.' }] };
      }

      // Response size guard — truncate large arrays, then re-check size
      let processed = truncateLargeArrays(data);
      let json = JSON.stringify(processed, null, 2);
      // If still too large after array truncation, progressively shrink arrays
      if (json.length > MAX_RESPONSE_BYTES && typeof processed === 'object' && processed !== null) {
        const obj = processed as Record<string, unknown>;
        for (const [key, value] of Object.entries(obj)) {
          if (Array.isArray(value) && value.length > 5) {
            obj[key] = value.slice(0, 5);
            obj[`_${key}_note`] = `Aggressively trimmed to 5 items due to size. Request specific filters for full data.`;
          }
        }
        json = JSON.stringify(obj, null, 2);
      }
      if (json.length > MAX_RESPONSE_BYTES) {
        // Last resort: valid JSON with truncation note
        json = JSON.stringify({ _error: 'Response too large. Use specific filters (symbol, date range, limit) to narrow results.', _size: `${Math.round(json.length / 1024)}KB` });
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
