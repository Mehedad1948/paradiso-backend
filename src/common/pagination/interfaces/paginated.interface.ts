export interface Paginated<T> {
  meta: {
    itemsPerPage: number;
    totalItems: number;
    currentPage: number;
    totalPages: number;
  };
  links: {
    first: string;
    previous: string;
    next: string;
    last: string;
    current: string;
  };
  data: T[];
}
