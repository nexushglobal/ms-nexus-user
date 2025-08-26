export interface DashboardRequestDto {
  page: number;
  limit: number;
  offset: number;
  sortBy: 'volume' | 'lots';
  sortOrder: 'asc' | 'desc';
}

export interface DashboardResponseDto {
  users: any[];
  total: number;
}