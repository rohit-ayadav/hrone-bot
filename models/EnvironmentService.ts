import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEnvironmentService extends Document {
  name: string;
  category: string;
  description?: string;
  devUrl: string;
  qaUrl: string;
  prodUrl: string;
  localUrl?: string;
  tags: string[];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const EnvironmentServiceSchema: Schema<IEnvironmentService> = new Schema<IEnvironmentService>(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, default: 'Web Apps', trim: true },
    description: { type: String, default: '', trim: true },
    devUrl: { type: String, default: '', trim: true },
    qaUrl: { type: String, default: '', trim: true },
    prodUrl: { type: String, default: '', trim: true },
    localUrl: { type: String, default: '', trim: true },
    tags: { type: [String], default: [] },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const EnvironmentService: Model<IEnvironmentService> =
  mongoose.models.EnvironmentService ||
  mongoose.model<IEnvironmentService>('EnvironmentService', EnvironmentServiceSchema);

export default EnvironmentService;
