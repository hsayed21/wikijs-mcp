/**
 * Wiki.js MCP Server Type Definitions
 */

// Wiki.js Page Types
export interface WikiPage {
  id: number;
  path: string;
  title: string;
  description: string;
  content?: string;
  contentType?: string;
  isPublished: boolean;
  locale: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
}

export interface WikiPageListItem {
  id: number;
  path: string;
  title: string;
  description: string;
  isPublished: boolean;
  locale: string;
  contentType: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface SearchResult {
  id: number;
  title: string;
  path: string;
  description: string;
  locale: string;
}

export interface WikiSearchResult extends Omit<SearchResult, 'id'> {
  id: string | number;
}

export interface WikiSearchResponse extends Omit<SearchResponse, 'results'> {
  results: WikiSearchResult[];
}

export interface SearchResponse {
  results: SearchResult[];
  suggestions: string[];
  totalHits: number;
}

export interface WikiPageTreeNode {
  id: number;
  path: string;
  depth: number;
  title: string;
  isPrivate: boolean;
  isFolder: boolean;
  privateNS?: string;
  parent?: number;
  pageId?: number;
  locale: string;
}

// Pagination Types
export interface PaginationMeta {
  limit: number;
  offset: number;
  total_count: number;
  has_more: boolean;
  next_offset?: number;
}
