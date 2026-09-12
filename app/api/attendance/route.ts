import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import User from '@/models/User';
import AttendanceLog from '@/models/AttendanceLog';
import { markAttendance } from '@/lib/markAttendance';
import { sendTelegramMessage } from '@/lib/telegram';

export async function GET(request: Request) {
    // 1. Security: Prevent unauthorized triggers
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        await connectToDatabase();

        // 2. Fetch all active registered users from MongoDB
        let users = await User.find({ autoMarkEnabled: true, registrationState: 'IDLE' });

        // Fallback: If MongoDB has no active users but env variables exist, construct fallback user
        if ((!users || users.length === 0) && process.env.HR_USERNAME && process.env.HR_PASSWORD) {
            users = [{
                chatId: process.env.TELEGRAM_CHAT_ID || '',
                hrUsername: process.env.HR_USERNAME,
                hrPassword: process.env.HR_PASSWORD,
                domainCode: 'uharvest',
                employeeId: 4050,
                latitude: '28.500385614012345',
                longitude: '77.41499672380527',
                geoAccuracy: '10',
                geoLocation: '210-211, altF Coworking Space, Sector 142, Noida, Uttar Pradesh 201304, India',
                autoMarkEnabled: true,
                registrationState: 'IDLE',
            } as any];
        }

        const results: any[] = [];

        // 3. Execute attendance mark for each active user
        for (const user of users) {
            try {
                const result = await markAttendance(undefined, {
                    hrUsername: user.hrUsername,
                    hrPassword: user.hrPassword,
                    domainCode: user.domainCode,
                    employeeId: user.employeeId,
                    latitude: user.latitude,
                    longitude: user.longitude,
                    geoLocation: user.geoLocation,
                    geoAccuracy: user.geoAccuracy,
                });

                const reqJson = JSON.stringify(result.requestPayload, null, 2);
                const truncatedReq = reqJson.length > 1500 ? reqJson.substring(0, 1500) + '\n... (truncated)' : reqJson;

                const resJson = JSON.stringify(result.response, null, 2);
                const truncatedRes = resJson.length > 1500 ? resJson.substring(0, 1500) + '\n... (truncated)' : resJson;

                const successMessage =
                    `⏰ <b>Automated Attendance Triggered (Success)</b>\n\n` +
                    `<b>Account:</b> ${user.hrUsername}\n` +
                    `<b>Action:</b> Punch ${result.action}\n` +
                    `<b>Punch Time:</b> ${result.punchTime} (IST)\n` +
                    `<b>Location:</b> ${user.geoLocation}\n` +
                    `<b>Status:</b> Success ✅\n\n` +
                    `<b>📤 Sent Request Payload:</b>\n` +
                    `<pre><code class="language-json">${truncatedReq}</code></pre>\n\n` +
                    `<b>📥 Received API Response:</b>\n` +
                    `<pre><code class="language-json">${truncatedRes}</code></pre>`;

                if (user.chatId) {
                    await AttendanceLog.create({
                        chatId: user.chatId,
                        hrUsername: user.hrUsername,
                        action: result.action,
                        punchTime: result.punchTime,
                        status: 'SUCCESS',
                        source: 'AUTOMATED_CRON',
                        requestPayload: result.requestPayload,
                        responsePayload: result.response,
                    });

                    await sendTelegramMessage(
                        successMessage,
                        user.chatId,
                        {
                            inline_keyboard: [
                                [{ text: '📍 Punch Attendance Again', callback_data: 'action_mark' }],
                                [{ text: 'ℹ️ Check System Status', callback_data: 'action_status' }]
                            ]
                        }
                    );
                }

                results.push({
                    chatId: user.chatId,
                    username: user.hrUsername,
                    status: 'success',
                    result,
                });
            } catch (userErr: any) {
                console.error(`Failed to mark attendance for user ${user.hrUsername}:`, userErr);

                const now = new Date();
                const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toLocaleString('en-IN');

                const failureMessage =
                    `🚨 <b>Automated Attendance Failed!</b>\n\n` +
                    `<b>Account:</b> ${user.hrUsername}\n` +
                    `<b>Error:</b> ${userErr.message || 'Unknown error'}\n` +
                    `<b>Timestamp:</b> ${istTime} (IST)\n` +
                    `<b>Domain:</b> ${user.domainCode || 'uharvest'}\n\n` +
                    (userErr.stack ? `<b>Stack Trace:</b>\n<pre><code>${userErr.stack.substring(0, 800)}</code></pre>` : '');

                if (user.chatId) {
                    await AttendanceLog.create({
                        chatId: user.chatId,
                        hrUsername: user.hrUsername,
                        action: (new Date().getHours() < 14 ? 'In' : 'Out'),
                        punchTime: new Date().toISOString(),
                        status: 'FAILED',
                        source: 'AUTOMATED_CRON',
                        errorMessage: userErr.message || 'Unknown error',
                    });

                    await sendTelegramMessage(
                        failureMessage,
                        user.chatId,
                        {
                            inline_keyboard: [
                                [{ text: '🔄 Retry Punch Now', callback_data: 'action_mark' }],
                                [{ text: 'ℹ️ Check System Status', callback_data: 'action_status' }]
                            ]
                        }
                    );
                }

                results.push({
                    chatId: user.chatId,
                    username: user.hrUsername,
                    status: 'failed',
                    error: userErr.message,
                });
            }
        }

        return NextResponse.json({
            success: true,
            totalProcessed: users.length,
            results,
        });
    } catch (error: any) {
        console.error('Failed execution in multi-user attendance cron:', error);
        return NextResponse.json({ error: 'Cron Failed', details: error.message }, { status: 500 });
    }
}