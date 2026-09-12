import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import User from '@/models/User';
import AttendanceLog from '@/models/AttendanceLog';

export async function GET(request: Request) {
    try {
        const db = await connectToDatabase();

        const now = new Date();
        const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const pad = (n: number) => n.toString().padStart(2, '0');
        const todayStr = `${istDate.getFullYear()}-${pad(istDate.getMonth() + 1)}-${pad(istDate.getDate())}`;
        const monthPrefix = `${istDate.getFullYear()}-${pad(istDate.getMonth() + 1)}`;

        if (!db) {
            return NextResponse.json({
                success: true,
                platformStats: {
                    totalUsers: 0,
                    autoUsers: 0,
                    todayPunches: 0,
                    monthlyPunches: 0,
                },
                recentLogs: [],
            });
        }

        const { searchParams } = new URL(request.url);
        const chatId = searchParams.get('chatId');

        if (chatId) {
            // Personal user statistics for Telegram / user view
            const user = await User.findOne({ chatId });
            if (!user) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }

            const monthLogs = await AttendanceLog.find({
                chatId,
                status: 'SUCCESS',
                punchTime: { $regex: monthPrefix }
            }).sort({ createdAt: 1 });

            // Calculate unique days worked
            const daysSet = new Set<string>();
            let cronPunches = 0;
            let manualPunches = 0;

            monthLogs.forEach((log) => {
                if (log.punchTime) {
                    const datePart = log.punchTime.split('T')[0];
                    daysSet.add(datePart);
                }
                if (log.source === 'AUTOMATED_CRON') cronPunches++;
                else manualPunches++;
            });

            // Calculate total hours worked
            let totalWorkedMinutes = 0;
            const dayLogsMap: { [date: string]: { in?: Date; out?: Date } } = {};

            monthLogs.forEach((log) => {
                const datePart = log.punchTime?.split('T')[0];
                if (!datePart) return;
                if (!dayLogsMap[datePart]) dayLogsMap[datePart] = {};

                const logTime = new Date(log.punchTime);
                if (log.action === 'In' && !dayLogsMap[datePart].in) {
                    dayLogsMap[datePart].in = logTime;
                } else if (log.action === 'Out') {
                    dayLogsMap[datePart].out = logTime;
                }
            });

            Object.values(dayLogsMap).forEach((day) => {
                if (day.in && day.out) {
                    const diffMs = day.out.getTime() - day.in.getTime();
                    if (diffMs > 0) {
                        totalWorkedMinutes += Math.floor(diffMs / (1000 * 60));
                    }
                }
            });

            const totalHours = Math.floor(totalWorkedMinutes / 60);
            const remainingMins = totalWorkedMinutes % 60;
            const daysWorkedCount = daysSet.size;
            const avgMinsPerDay = daysWorkedCount > 0 ? Math.floor(totalWorkedMinutes / daysWorkedCount) : 0;
            const avgHours = Math.floor(avgMinsPerDay / 60);
            const avgMins = avgMinsPerDay % 60;

            return NextResponse.json({
                success: true,
                month: monthPrefix,
                username: user.hrUsername,
                daysWorked: daysWorkedCount,
                totalHours: `${totalHours}h ${remainingMins}m`,
                averagePerDay: `${avgHours}h ${avgMins}m`,
                cronPunches,
                manualPunches,
                totalPunches: monthLogs.length,
            });
        }

        // Overall Multi-Tenant Platform Statistics for Web Dashboard
        const [totalUsers, autoUsers, todayPunches, monthlyPunches, recentLogs] = await Promise.all([
            User.countDocuments({ registrationState: 'IDLE' }).catch(() => 0),
            User.countDocuments({ registrationState: 'IDLE', autoMarkEnabled: true }).catch(() => 0),
            AttendanceLog.countDocuments({ status: 'SUCCESS', punchTime: { $regex: todayStr } }).catch(() => 0),
            AttendanceLog.countDocuments({ status: 'SUCCESS', punchTime: { $regex: monthPrefix } }).catch(() => 0),
            AttendanceLog.find().sort({ createdAt: -1 }).limit(10).catch(() => []),
        ]);

        return NextResponse.json({
            success: true,
            platformStats: {
                totalUsers,
                autoUsers,
                todayPunches,
                monthlyPunches,
            },
            recentLogs: (recentLogs || []).map((l) => ({
                id: l._id,
                chatId: l.chatId,
                username: l.hrUsername,
                action: l.action,
                punchTime: l.punchTime,
                status: l.status,
                source: l.source,
                createdAt: l.createdAt,
            })),
        });
    } catch (error: any) {
        console.error('Error fetching stats:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to fetch statistics',
            details: error.message,
            platformStats: { totalUsers: 0, autoUsers: 0, todayPunches: 0, monthlyPunches: 0 },
            recentLogs: [],
        }, { status: 200 });
    }
}
