import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Shared page/limit query params for list endpoints. */
export class PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}

export interface Paginated<T> {
  data:       T[];
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}

/** Build the standard paginated envelope. */
export function paginated<T>(data: T[], total: number, page: number, limit: number): Paginated<T> {
  return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
