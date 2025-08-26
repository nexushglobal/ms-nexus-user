export class Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

export class PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}