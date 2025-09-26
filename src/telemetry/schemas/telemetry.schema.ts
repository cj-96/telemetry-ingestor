import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TelemetryDocument = HydratedDocument<Telemetry>;

@Schema({ _id: false })
export class Metrics {
  @Prop() temperature!: number;
  @Prop() humidity!: number;
}
export const MetricsSchema = SchemaFactory.createForClass(Metrics);

@Schema()
export class Telemetry {
  @Prop({ required: true, type: String })
  deviceId!: string;

  @Prop({ required: true, type: String })
  siteId!: string;

  @Prop({ required: true, type: Date, index: true })
  ts!: Date;

  @Prop({ required: true, type: MetricsSchema })
  metrics!: Metrics;
}

export const TelemetrySchema = SchemaFactory.createForClass(Telemetry);
