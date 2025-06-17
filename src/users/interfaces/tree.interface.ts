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
  };
}

export interface TreeQueryParams {
  userId: string;
  depth?: number;
}
