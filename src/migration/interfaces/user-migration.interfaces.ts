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
  firstName: string;
  lastName: string;
  gender: 'MASCULINO' | 'FEMENINO' | 'OTRO';
  birthDate: string;
  phone: string;
  role_code: string;
  parent_id?: string | null;
  nickname?: string | null;
  photo?: string | null;
  contact_address?: string | null;
  postalCode?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  cci?: string | null;
  billing_address?: string | null;
  lastLoginAt?: string | null;
  documentNumber?: string;
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
