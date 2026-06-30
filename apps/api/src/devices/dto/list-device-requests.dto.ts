import { IsEnum, IsOptional } from 'class-validator';
import { DeviceRequestStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListDeviceRequestsDto extends PaginationQueryDto {
  @IsEnum(DeviceRequestStatus)
  @IsOptional()
  status?: DeviceRequestStatus;
}
