import {
  IsString,
  IsNumber,
  IsNotEmpty,
  IsISO8601,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

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
  @Matches(/^dev-\d{3}$/, { message: 'deviceId must be a valid Device ID' })
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^site-[A-Za-z]+$/, { message: 'siteId must be a valid Site ID' })
  siteId!: string;

  @IsISO8601()
  @IsNotEmpty()
  @Transform(({ value }) => new Date(value as string))
  ts!: Date;

  @ValidateNested()
  @Type(() => Metric)
  @IsNotEmpty()
  metrics!: Metric;
}
