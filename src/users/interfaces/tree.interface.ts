export interface TreeNode {
  id: string;
  email: string;
  referralCode: string;
  position: 'LEFT' | 'RIGHT' | null;
  isActive: boolean;
  fullName: string;
  depth: number;
  children?: {
    left?: TreeNode;
    right?: TreeNode;
  };
}

export interface TreeResponse {
  tree: TreeNode;
  metadata: {
    queryDurationMs: number;
    requestedDepth: number;
    rootUserId: string;
    currentUserId: string;
    canGoUp: boolean;
    parentId?: string;
  };
}

export interface TreeSearchResult {
  id: string;
  email: string;
  referralCode: string;
  fullName: string;
  documentNumber?: string;
  position: 'LEFT' | 'RIGHT' | null;
  isActive: boolean;
}

export interface TreeSearchResponse {
  results: TreeSearchResult[];
  metadata: {
    queryDurationMs: number;
    total: number;
    page: number;
    limit: number;
    searchTerm: string;
    rootUserId: string;
  };
}

export interface TreeQueryParams {
  userId?: string;
  depth?: number;
  currentUserId: string;
}

export interface TreeSearchParams {
  search?: string;
  page?: number;
  limit?: number;
  currentUserId: string;
}
