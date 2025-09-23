import { IsString, IsNumber, IsNotEmpty, IsISO8601 } from 'class-validator';

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
  eventId!: string; // <-- IDEMPOTENCY KEY

  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  siteId!: string;

  @IsISO8601()
  ts!: string;

  metrics!: Metric;
}
