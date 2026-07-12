/**
 * Wiki.js GraphQL API Client
 *
 * Provides methods to interact with the Wiki.js GraphQL API
 */

import { API_TIMEOUT, CHARACTER_LIMIT } from '../constants.js';
import type {
  WikiPage,
  WikiPageListItem,
  SearchResponse,
  SearchResult,
  WikiSearchResponse,
  WikiPageTreeNode,
} from '../types.js';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

type SortDirection = 'ASC' | 'DESC';

function compareValues(left: string | number | undefined, right: string | number | undefined, direction: SortDirection): number {
  const multiplier = direction === 'ASC' ? 1 : -1;

  if (typeof left === 'number' && typeof right === 'number') {
    return (left - right) * multiplier;
  }

  return String(left ?? '').localeCompare(String(right ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  }) * multiplier;
}

type WikiPageIdentity = Pick<WikiPageListItem, 'id' | 'path' | 'locale' | 'isPublished'>;

function pageKey(locale: string, path: string): string {
  return `${locale}:${path}`;
}

function graphqlEndpoint(apiUrl: string): string {
  const baseUrl = apiUrl.replace(/\/+$/, '');
  return baseUrl.endsWith('/graphql') ? baseUrl : `${baseUrl}/graphql`;
}

export class WikiJsClient {
  private apiUrl: string;
  private apiToken: string;

  constructor(apiUrl: string, apiToken: string) {
    this.apiUrl = graphqlEndpoint(apiUrl);
    this.apiToken = apiToken;
  }

  /**
   * Execute a GraphQL query
   */
  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = (await response.json()) as GraphQLResponse<T>;

      if (result.errors) {
        // Log full error for debugging, return only messages to client
        console.error('GraphQL API errors:', JSON.stringify(result.errors));
        const messages = result.errors.map((e) => e.message).join('; ');
        throw new Error(`GraphQL request failed: ${messages}`);
      }

      if (!result.data) {
        throw new Error('No data returned from GraphQL API');
      }

      return result.data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      throw new Error(`Wiki.js API request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List all pages with optional filtering
   */
  async listPages(
    locale: string | null = null,
    limit: number = 100,
    offset: number = 0,
    path: string | null = null
  ): Promise<{ pages: WikiPageListItem[]; total: number }> {
    const query = `
      query {
        pages {
          list {
            id
            path
            title
            description
            isPublished
            locale
            contentType
            createdAt
            updatedAt
            tags
          }
        }
      }
    `;

    const data = await this.query<{ pages: { list: WikiPageListItem[] } }>(query);
    let pages = data.pages.list;

    // Filter by locale if provided
    if (locale) {
      pages = pages.filter((p) => p.locale === locale);
    }

    // Keep support-facing retrieval scoped to published pages.
    pages = pages.filter((p) => p.isPublished);

    // Filter to pages under the requested path if provided.
    if (path) {
      pages = pages.filter((p) => p.path.startsWith(path));
    }

    pages = pages.sort((left, right) => compareValues(left.title, right.title, 'ASC'));

    const total = pages.length;

    const paginatedPages = limit < 0 ? pages : pages.slice(offset, offset + limit);

    return { pages: paginatedPages, total };
  }

  /**
   * Get a single page by ID
   */
  async getPageById(id: number): Promise<WikiPage | null> {
    const query = `
      query($id: Int!) {
        pages {
          single(id: $id) {
            id
            path
            title
            description
            content
            contentType
            isPublished
            locale
            createdAt
            updatedAt
          }
        }
      }
    `;

    const data = await this.query<{ pages: { single: WikiPage | null } }>(query, { id });
    const page = data.pages.single;

    // Truncate content if needed
    if (page?.content && page.content.length > CHARACTER_LIMIT) {
      page.content =
        page.content.substring(0, CHARACTER_LIMIT) +
        `\n\n[Content truncated. Original length: ${page.content.length} chars. Use path-based access for full content.]`;
    }

    return page;
  }

  /**
   * Get a single page by path
   */
  async getPageByPath(path: string, locale: string = 'en'): Promise<WikiPage | null> {
    const query = `
      query($path: String!, $locale: String!) {
        pages {
          singleByPath(path: $path, locale: $locale) {
            id
            path
            title
            description
            content
            contentType
            isPublished
            locale
            createdAt
            updatedAt
          }
        }
      }
    `;

    const data = await this.query<{ pages: { singleByPath: WikiPage | null } }>(query, { path, locale });
    const page = data.pages.singleByPath;

    // Truncate content if needed
    if (page?.content && page.content.length > CHARACTER_LIMIT) {
      page.content =
        page.content.substring(0, CHARACTER_LIMIT) +
        `\n\n[Content truncated. Original length: ${page.content.length} chars]`;
    }

    return page;
  }

  /**
   * Search pages
   */
  async searchPages(
    searchQuery: string,
    locale: string | null = null,
    path: string | null = null
  ): Promise<SearchResponse> {
    const query = `
      query($query: String!) {
        pages {
          search(query: $query) {
            results {
              id
              title
              path
              description
              locale
            }
            suggestions
            totalHits
          }
          list {
            id
            path
            locale
            isPublished
          }
        }
      }
    `;

    const data = await this.query<{
      pages: { search: WikiSearchResponse; list: WikiPageIdentity[] };
    }>(query, { query: searchQuery });

    // Wiki.js search result IDs belong to the search index and are not safe to
    // pass to pages.single. Resolve every result to the canonical page ID from
    // pages.list using the stable locale + path identity.
    const activePages = data.pages.list.filter((page) =>
      page.isPublished &&
      (!locale || page.locale === locale) &&
      (!path || page.path.startsWith(path))
    );
    const pagesByKey = new Map(activePages.map((page) => [pageKey(page.locale, page.path), page]));
    const results = data.pages.search.results
      .map((result): SearchResult | null => {
        const page = pagesByKey.get(pageKey(result.locale, result.path));
        return page ? { ...result, id: page.id } : null;
      })
      .filter((result): result is SearchResult => result !== null)
      .sort((left, right) => compareValues(left.title, right.title, 'ASC'));

    return {
      results,
      suggestions: data.pages.search.suggestions,
      totalHits: results.length,
    };
  }

  /**
   * Get the hierarchical Wiki.js page tree
   */
  async getPageTree(
    path: string | null = null,
    parent: number | null = null,
    mode: 'ALL' | 'FOLDERS' | 'PAGES' = 'ALL',
    locale: string = 'en',
    includeAncestors: boolean = false
  ): Promise<WikiPageTreeNode[]> {
    const query = `
      query($path: String, $parent: Int, $mode: PageTreeMode!, $locale: String!, $includeAncestors: Boolean) {
        pages {
          tree(path: $path, parent: $parent, mode: $mode, locale: $locale, includeAncestors: $includeAncestors) {
            id
            path
            depth
            title
            isPrivate
            isFolder
            privateNS
            parent
            pageId
            locale
          }
        }
      }
    `;

    const data = await this.query<{ pages: { tree: WikiPageTreeNode[] } }>(query, {
      path,
      parent,
      mode,
      locale,
      includeAncestors,
    });

    const { pages: activePages } = await this.listPages(locale, -1, 0, path ?? null);
    const activePagePaths = new Set(activePages.map((page) => page.path));

    return data.pages.tree.filter((node) => {
      if (!node.isFolder) {
        return activePagePaths.has(node.path);
      }

      return activePages.some((page) => page.path === node.path || page.path.startsWith(`${node.path}/`));
    });
  }

}
