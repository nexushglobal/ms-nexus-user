export interface RoleMigrationData {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ViewMigrationData {
  id: number;
  code: string;
  name: string;
  icon?: string;
  url?: string;
  isActive: boolean;
  order: number;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  parentId?: number | null;
}

export interface RoleViewRelation {
  view_id: number;
  role_id: number;
}

export interface MigrationResult {
  success: boolean;
  message: string;
  details: {
    roles: {
      total: number;
      created: number;
      skipped: number;
      errors: string[];
    };
    views: {
      total: number;
      created: number;
      skipped: number;
      errors: string[];
    };
    relations: {
      total: number;
      created: number;
      skipped: number;
      errors: string[];
    };
  };
}
