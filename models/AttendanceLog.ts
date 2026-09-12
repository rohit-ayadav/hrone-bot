import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAttendanceLog extends Document {
  chatId: string;
  hrUsername: string;
  action: 'In' | 'Out';
  punchTime: string;
  status: 'SUCCESS' | 'FAILED';
  source: 'MANUAL' | 'AUTOMATED_CRON' | 'PRE_PUNCH_ALERT';
  requestPayload?: any;
  responsePayload?: any;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceLogSchema: Schema<IAttendanceLog> = new Schema<IAttendanceLog>(
  {
    chatId: { type: String, required: true, index: true },
    hrUsername: { type: String, required: true, index: true },
    action: { type: String, enum: ['In', 'Out'], required: true },
    punchTime: { type: String, required: true },
    status: { type: String, enum: ['SUCCESS', 'FAILED'], required: true },
    source: { type: String, enum: ['MANUAL', 'AUTOMATED_CRON', 'PRE_PUNCH_ALERT'], default: 'MANUAL' },
    requestPayload: { type: Schema.Types.Mixed },
    responsePayload: { type: Schema.Types.Mixed },
    errorMessage: { type: String, default: '' },
  },
  { timestamps: true }
);

const AttendanceLog: Model<IAttendanceLog> =
  mongoose.models.AttendanceLog || mongoose.model<IAttendanceLog>('AttendanceLog', AttendanceLogSchema);

export default AttendanceLog;
