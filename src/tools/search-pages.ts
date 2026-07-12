/**
 * wikijs_search_pages Tool
 *
 * Searches pages in Wiki.js
 */

import { z } from 'zod';
import type { WikiJsClient } from '../services/client.js';
import { searchPagesSchema, type SearchPagesInput } from '../schemas/index.js';
import { handleToolError } from '../services/error-handler.js';

export const searchPagesToolDefinition = {
  name: 'wikijs_search_pages',
  description: `Search for pages in Wiki.js by query string.

This tool performs a full-text search across published page content and metadata. Results are ranked by relevance.

Args:
  - query (string, required): Search query (min 2 chars, max 200 chars)
  - locale (string, optional): Filter results by locale
  - path (string, optional): Only include pages under this path

Returns:
  - totalHits: Total number of matching published pages
  - suggestions: Search suggestions for refinement
  - results: Array of matching pages (canonical page id, title, path, description, locale)

The returned id is resolved from Wiki.js pages.list and is safe to pass to wikijs_get_page.
Pass that canonical id by itself to wikijs_get_page to retrieve the exact page; locale is not required.

Examples:
  - Search for topic: query="osTicket API"
  - Search in German pages: query="Plugin", locale="de"
  - Search inside a section: query="API", path="osticket/"`,
  inputSchema: searchPagesSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

export async function handleSearchPages(
  client: WikiJsClient,
  args: z.infer<typeof searchPagesSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    // Validate input with Zod
    const validated: SearchPagesInput = searchPagesSchema.parse(args);

    const results = await client.searchPages(
      validated.query,
      validated.locale ?? null,
      validated.path ?? null
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              totalHits: results.totalHits,
              suggestions: results.suggestions,
              results: results.results.map((r) => ({
                id: r.id,
                title: r.title,
                path: r.path,
                description: r.description,
                locale: r.locale,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    return handleToolError(error, 'wikijs_search_pages');
  }
}
