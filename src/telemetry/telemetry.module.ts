import { Module } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { Mongoose } from 'mongoose';

@Module({
  imports: [
    Mongoose.apply({
      uri: process.env.MONGODB_URI,
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }),
  ],
  controllers: [TelemetryController],
  providers: [TelemetryService],
})
export class TelemetryModule {}
