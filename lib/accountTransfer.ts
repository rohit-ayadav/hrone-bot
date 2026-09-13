import User, { IUser } from '@/models/User';
import { sendTelegramMessage } from './telegram';
import { connectToDatabase } from './db';

/**
 * Checks if an HRone username is already linked to an existing active Telegram account.
 */
export async function findExistingHROneUser(hrUsername: string, currentChatId: string): Promise<IUser | null> {
    await connectToDatabase();
    return await User.findOne({
        hrUsername: { $regex: new RegExp(`^${hrUsername.trim()}$`, 'i') },
        chatId: { $ne: currentChatId },
        registrationState: 'IDLE',
    });
}

/**
 * Generates a 6-digit OTP, sends it to the old Telegram account, and updates the requesting user's state.
 */
export async function initiateAccountTransfer(
    requestingUser: IUser,
    targetExistingUser: IUser,
    newTelegramUsername?: string
): Promise<{ success: boolean; otp?: string; error?: string }> {
    try {
        await connectToDatabase();

        // Generate random 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes valid

        requestingUser.transferOtp = otp;
        requestingUser.transferOtpExpiresAt = expiresAt;
        requestingUser.pendingTransferTargetChatId = targetExistingUser.chatId;
        requestingUser.hrUsername = targetExistingUser.hrUsername;
        requestingUser.registrationState = 'AWAITING_TRANSFER_OTP';
        if (newTelegramUsername) requestingUser.telegramUsername = newTelegramUsername;
        await requestingUser.save();

        // Notify the OLD Telegram account with the OTP
        const requesterIdentifier = newTelegramUsername
            ? `@${newTelegramUsername}`
            : `Telegram user (Chat ID: ****${requestingUser.chatId.slice(-4)})`;

        const oldUserNotice =
            `🔐 <b>Security Alert: Account Transfer Requested</b>\n\n` +
            `A transfer request was initiated for your HRone account (<code>${targetExistingUser.hrUsername}</code>) by ${requesterIdentifier}.\n\n` +
            `🔑 <b>Your 6-Digit Transfer OTP:</b> <code>${otp}</code>\n\n` +
            `<i>This code will expire in 10 minutes. If you did NOT request this, do NOT share this OTP with anyone!</i>`;

        await sendTelegramMessage(oldUserNotice, targetExistingUser.chatId);

        // Notify the NEW Telegram account
        const oldUserDisplayName = targetExistingUser.telegramUsername
            ? `@${targetExistingUser.telegramUsername}`
            : `Chat ID ****${targetExistingUser.chatId.slice(-4)}`;

        const newUserInstructions =
            `📩 <b>OTP Sent to Existing Telegram Account!</b>\n\n` +
            `A 6-digit confirmation OTP has been sent via Telegram message to <b>${oldUserDisplayName}</b>.\n\n` +
            `Please type or paste the <b>6-digit OTP</b> here to complete the transfer:`;

        await sendTelegramMessage(newUserInstructions, requestingUser.chatId, {
            inline_keyboard: [
                [{ text: '✏️ Change Username', callback_data: 'action_change_username' }],
                [{ text: '❌ Cancel Transfer', callback_data: 'action_cancel' }]
            ]
        });

        return { success: true, otp };
    } catch (err: any) {
        console.error('Error initiating account transfer:', err);
        return { success: false, error: err.message || 'Failed to initiate account transfer' };
    }
}

/**
 * Verifies the entered OTP and transfers the HRone credentials and settings to the new Telegram account.
 */
export async function verifyAndExecuteTransfer(
    requestingUser: IUser,
    otpInput: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await connectToDatabase();

        if (requestingUser.registrationState !== 'AWAITING_TRANSFER_OTP' || !requestingUser.pendingTransferTargetChatId) {
            return { success: false, error: 'No pending transfer request found.' };
        }

        if (!requestingUser.transferOtpExpiresAt || requestingUser.transferOtpExpiresAt < new Date()) {
            return { success: false, error: 'The transfer OTP has expired. Please restart registration.' };
        }

        if (requestingUser.transferOtp !== otpInput.trim()) {
            return { success: false, error: 'Invalid OTP code. Please enter the correct 6-digit OTP sent to the old Telegram account.' };
        }

        const targetOldUser = await User.findOne({ chatId: requestingUser.pendingTransferTargetChatId });

        if (!targetOldUser) {
            return { success: false, error: 'The original account could not be found.' };
        }

        // Copy credentials and profile from targetOldUser to requestingUser
        requestingUser.hrUsername = targetOldUser.hrUsername;
        requestingUser.hrPassword = targetOldUser.hrPassword;
        requestingUser.domainCode = targetOldUser.domainCode;
        requestingUser.employeeId = targetOldUser.employeeId;
        requestingUser.latitude = targetOldUser.latitude;
        requestingUser.longitude = targetOldUser.longitude;
        requestingUser.geoLocation = targetOldUser.geoLocation;
        requestingUser.geoAccuracy = targetOldUser.geoAccuracy;
        requestingUser.autoMarkEnabled = targetOldUser.autoMarkEnabled;
        requestingUser.registrationState = 'IDLE';
        requestingUser.transferOtp = undefined;
        requestingUser.transferOtpExpiresAt = undefined;
        requestingUser.pendingTransferTargetChatId = undefined;

        await requestingUser.save();

        // Delete old user account so duplicate doesn't remain
        await User.deleteOne({ chatId: targetOldUser.chatId });

        // Notify old Telegram account that their account was transferred
        const newTelegramInfo = requestingUser.telegramUsername
            ? `@${requestingUser.telegramUsername}`
            : `Chat ID ****${requestingUser.chatId.slice(-4)}`;

        const unlinkedNotice =
            `ℹ️ <b>HRone Account Unlinked & Transferred</b>\n\n` +
            `Your HRone account (<code>${targetOldUser.hrUsername}</code>) has been successfully transferred to Telegram user ${newTelegramInfo}.\n\n` +
            `Automated punches for this Telegram chat have been stopped.`;

        await sendTelegramMessage(unlinkedNotice, targetOldUser.chatId);

        return { success: true };
    } catch (err: any) {
        console.error('Error executing account transfer:', err);
        return { success: false, error: err.message || 'Failed to complete transfer' };
    }
}

/**
 * Masks a string (e.g. Chat ID or Username) for privacy output.
 */
export function formatTelegramAccountIdentifier(user: IUser): string {
    if (user.telegramUsername) {
        return `@${user.telegramUsername}`;
    }
    const cid = user.chatId;
    return `Chat ID: ****${cid.slice(-4)}`;
}
