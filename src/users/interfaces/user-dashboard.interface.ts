export interface UserMembership {
  plan: string;
  startDate: Date;
  endDate: Date;
  status: string;
}

export interface UserVolumeInfo {
  leftVolume: number;
  rightVolume: number;
  totalVolume: number;
}

export interface UserLotInfo {
  purchased: number;
  sold: number;
  total: number;
}

export interface UserDashboardInfo {
  userId: string;
  fullName: string;
  email: string;
  membership: UserMembership | null;
  monthlyVolume: UserVolumeInfo;
  lots: UserLotInfo;
}

export interface UserDashboardResponse {
  users: UserDashboardInfo[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface GetUsersDashboardDto {
  page?: number;
  limit?: number;
  orderBy?: 'volume' | 'lots';
}