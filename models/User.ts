import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  chatId: string;
  telegramUsername?: string;
  hrUsername: string;
  hrPassword: string;
  domainCode: string;
  employeeId: number;
  latitude: string;
  longitude: string;
  geoLocation: string;
  geoAccuracy: string;
  autoMarkEnabled: boolean;
  registrationState: 'IDLE' | 'AWAITING_HR_USERNAME' | 'AWAITING_HR_PASSWORD' | 'AWAITING_LOCATION' | 'AWAITING_TRANSFER_OTP';
  transferOtp?: string;
  transferOtpExpiresAt?: Date;
  pendingTransferTargetChatId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema<IUser> = new Schema<IUser>(
  {
    chatId: { type: String, required: true, unique: true, index: true },
    telegramUsername: { type: String, default: '' },
    hrUsername: { type: String, required: true },
    hrPassword: { type: String, required: true },
    domainCode: { type: String, default: 'uharvest' },
    employeeId: { type: Number, default: 4050 },
    latitude: { type: String, default: '28.500385614012345' },
    longitude: { type: String, default: '77.41499672380527' },
    geoLocation: { type: String, default: '210-211, altF Coworking Space, Sector 142, Noida, Uttar Pradesh 201304, India' },
    geoAccuracy: { type: String, default: '10' },
    autoMarkEnabled: { type: Boolean, default: true },
    registrationState: {
      type: String,
      enum: ['IDLE', 'AWAITING_HR_USERNAME', 'AWAITING_HR_PASSWORD', 'AWAITING_LOCATION', 'AWAITING_TRANSFER_OTP'],
      default: 'IDLE'
    },
    transferOtp: { type: String, default: undefined },
    transferOtpExpiresAt: { type: Date, default: undefined },
    pendingTransferTargetChatId: { type: String, default: undefined },
  },
  { timestamps: true }
);

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
