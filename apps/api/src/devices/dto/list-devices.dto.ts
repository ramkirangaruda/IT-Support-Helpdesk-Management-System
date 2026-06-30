import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DeviceStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListDevicesDto extends PaginationQueryDto {
  @IsEnum(DeviceStatus)
  @IsOptional()
  status?: DeviceStatus;

  @IsString()
  @IsOptional()
  type?: string;
}
