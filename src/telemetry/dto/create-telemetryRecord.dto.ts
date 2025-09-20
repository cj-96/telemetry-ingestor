import {
  IsString,
  IsObject,
  IsNumber,
  ValidateNested,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

class MetricsDto {
  @IsNumber()
  temperature?: number;

  @IsNumber()
  humidity?: number;
}

export class CreateTelemetryDto {
  @IsString()
  @MaxLength(50)
  deviceId?: string;

  @IsString()
  @MaxLength(50)
  siteId?: string;

  @IsDateString()
  ts?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => MetricsDto)
  metrics?: MetricsDto;
}
