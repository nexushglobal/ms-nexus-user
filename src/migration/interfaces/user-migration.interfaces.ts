// src/migration/interfaces/user-migration.interfaces.ts

export interface UserMigrationData {
  user_id: string;
  email: string;
  password: string;
  referralCode: string;
  referrerCode?: string;
  position?: 'LEFT' | 'RIGHT';
  isActive: boolean;
  user_created_at: string;
  user_updated_at: string;
  lastLoginAt?: string | null;
  nickname?: string | null;
  photo?: string | null;
  cloudinaryPublicId?: string | null;
  parent_id?: string | null;
  left_child_id?: string | null;
  right_child_id?: string | null;
  roleId: number;
  personal_info_id: number;
  firstName: string;
  lastName: string;
  documentNumber?: string | null;
  gender: 'MASCULINO' | 'FEMENINO' | 'OTRO';
  birthDate: string;
  contact_info_id: number;
  phone: string;
  contact_address?: string | null;
  postalCode?: string | null;
  billing_info_id?: number | null;
  billing_address?: string | null;
  bank_info_id?: number | null;
  bankName?: string | null;
  accountNumber?: string | null;
  cci?: string | null;
  role_code: string;
  role_name: string;
  role_is_active: boolean;
}

export interface UserMigrationResult {
  success: boolean;
  message: string;
  details: {
    users: {
      total: number;
      created: number;
      skipped: number;
      errors: string[];
    };
    relationships: {
      total: number;
      created: number;
      skipped: number;
      errors: string[];
    };
  };
}
