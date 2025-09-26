import {
  IsString,
  IsNumber,
  IsNotEmpty,
  IsISO8601,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class Metric {
  @IsNumber()
  @IsNotEmpty()
  temperature!: number;

  @IsNumber()
  @IsNotEmpty()
  humidity!: number;
}

export class CreateTelemetryDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  siteId!: string;

  @IsISO8601()
  ts!: string;

  @ValidateNested()
  @Type(() => Metric)
  @IsNotEmpty()
  metrics!: Metric;
}
