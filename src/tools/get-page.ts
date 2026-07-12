/**
 * wikijs_get_page Tool
 *
 * Retrieves a page from Wiki.js by ID or path
 */

import { z } from 'zod';
import type { WikiJsClient } from '../services/client.js';
import { getPageSchema, type GetPageInput } from '../schemas/index.js';
import { handleToolError, successResponse } from '../services/error-handler.js';

export const getPageToolDefinition = {
  name: 'wikijs_get_page',
  description: `Get a page from Wiki.js by ID or path. Returns full page content and metadata.

This tool retrieves a single page with all its content. Prefer the canonical numeric ID returned by wikijs_search_pages because it uniquely identifies the exact page and does not require a locale.

Args:
  - id (number, optional): Canonical Page ID from wikijs_search_pages. Locale is not needed.
  - path (string, optional): Exact page path, used only when id is omitted.
  - locale (string, optional): Required with path; ignored when id is provided.

Returns:
  Full page data including:
  - id, path, title, description
  - content (may be truncated for very large pages)
  - contentType, isPublished, locale
  - createdAt, updatedAt timestamps

Note: Content over 100,000 characters will be truncated with a notice.

Examples:
  - Get by ID: id=42
  - Get by path: path="osticket/api-endpoints", locale="en"`,
  inputSchema: getPageSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

export async function handleGetPage(
  client: WikiJsClient,
  args: z.infer<typeof getPageSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    // Validate input with Zod
    const validated: GetPageInput = getPageSchema.parse(args);

    if (!validated.id && !validated.path) {
      throw new Error('Either "id" or "path" must be provided');
    }

    if (!validated.id && !validated.locale) {
      throw new Error('Locale is required when retrieving a page by path');
    }

    const page = validated.id
      ? await client.getPageById(validated.id)
      : await client.getPageByPath(validated.path!, validated.locale!);

    if (!page) {
      throw new Error(`Page not found${validated.id ? ` with ID: ${validated.id}` : ` at path: ${validated.path}`}`);
    }

    return successResponse({
      page: {
        id: page.id,
        path: page.path,
        title: page.title,
        description: page.description,
        content: page.content,
        contentType: page.contentType,
        isPublished: page.isPublished,
        locale: page.locale,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
      },
    });
  } catch (error) {
    return handleToolError(error, 'wikijs_get_page');
  }
}
