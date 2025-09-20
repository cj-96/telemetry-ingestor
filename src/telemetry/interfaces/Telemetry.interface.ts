import { Document } from 'mongoose';

// Sub-document interface for Metrics
export interface Metrics {
  temperature: number;
  humidity: number;
}

// Main Telemetry interface
export interface Telemetry extends Document {
  readonly deviceId: string;
  readonly siteId: string;
  readonly ts: Date;
  readonly metrics: Metrics;
}
