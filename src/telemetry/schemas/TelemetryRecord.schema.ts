import * as mongoose from 'mongoose';

// Metrics sub-schema
const MetricsSchema = new mongoose.Schema({
  temperature: { type: Number, required: true },
  humidity: { type: Number, required: true },
});

// Main Telemetry schema
export const TelemetrySchema = new mongoose.Schema({
  deviceId: { type: String, required: true, maxlength: 50 },
  siteId: { type: String, required: true, maxlength: 50 },
  ts: { type: Date, required: true },
  metrics: { type: MetricsSchema, required: true }, // nested schema
});
