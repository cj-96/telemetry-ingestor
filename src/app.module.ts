import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelemetryModule } from './telemetry/telemetry.module';
import { databaseProviders } from 'database/database.providers';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    TelemetryModule,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    MongooseModule.forRoot(process.env.MONGO_URI || ''),
  ],
  controllers: [AppController],
  providers: [AppService, ...databaseProviders],
})
export class AppModule {}
