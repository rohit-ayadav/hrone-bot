'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Stats state
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Live IST Time
  const [istTime, setIstTime] = useState<string>('');
  const [shiftMode, setShiftMode] = useState<'In' | 'Out'>('In');

  const fetchStats = async () => {
    try {
      setStatsLoading(true);
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch platform stats:', e);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Kolkata',
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      };
      const formatted = new Intl.DateTimeFormat('en-IN', options).format(now);
      setIstTime(formatted);

      const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      setShiftMode(istDate.getHours() < 14 ? 'In' : 'Out');
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    fetchStats();

    return () => clearInterval(interval);
  }, []);

  const handleTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`/api/attendance?secret=${encodeURIComponent(secret)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.details?.message || `HTTP error ${res.status}`);
      }

      setResult(data);
      fetchStats(); // Refresh stats after manual punch
    } catch (err: any) {
      setError(err.message || 'Failed to trigger attendance mark');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-slate-950 font-sans relative overflow-hidden">
      {/* Dynamic Background Gradients */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-8 mb-8 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-white/20">
              <svg className="w-6 h-6 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">HROne Multi-Tenant Platform</h1>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                  Live Platform
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Multi-User Automated Attendance & Telegram Bot Engine</p>
            </div>
          </div>

          {/* Live IST Clock */}
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-xl px-4 py-2.5 flex flex-col items-start sm:items-end shadow-sm">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>IST Time (Asia/Kolkata)</span>
            </div>
            <div className="text-sm font-mono font-semibold text-slate-100 mt-0.5">
              {istTime || 'Loading time...'}
            </div>
          </div>
        </header>

        {/* Multi-Tenant KPI Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 shadow-lg">
            <span className="text-xs text-slate-400 font-medium">Registered Tenants</span>
            <p className="text-2xl font-bold text-white mt-1 font-mono">
              {statsLoading ? '...' : stats?.platformStats?.totalUsers ?? 0}
            </p>
            <span className="text-[11px] text-slate-500 mt-1 block">Active Telegram Accounts</span>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 shadow-lg">
            <span className="text-xs text-slate-400 font-medium">Auto-Punch Enabled</span>
            <p className="text-2xl font-bold text-emerald-400 mt-1 font-mono">
              {statsLoading ? '...' : stats?.platformStats?.autoUsers ?? 0}
            </p>
            <span className="text-[11px] text-emerald-500/80 mt-1 block">Automated Cron Profiles</span>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 shadow-lg">
            <span className="text-xs text-slate-400 font-medium">Today's Punches</span>
            <p className="text-2xl font-bold text-teal-400 mt-1 font-mono">
              {statsLoading ? '...' : stats?.platformStats?.todayPunches ?? 0}
            </p>
            <span className="text-[11px] text-teal-500/80 mt-1 block">Recorded in DB</span>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 shadow-lg">
            <span className="text-xs text-slate-400 font-medium">Monthly Punches</span>
            <p className="text-2xl font-bold text-cyan-400 mt-1 font-mono">
              {statsLoading ? '...' : stats?.platformStats?.monthlyPunches ?? 0}
            </p>
            <span className="text-[11px] text-cyan-500/80 mt-1 block">Total Successful Logs</span>
          </div>
        </div>

        {/* Dashboard Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column - Live Audit Stream & Manual Trigger */}
          <div className="lg:col-span-2 space-y-6">

            {/* Live Tenant Activity Audit Table */}
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Live Tenant Audit Activity
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">Recent attendance punch logs across registered tenants</p>
                </div>
                <button
                  onClick={fetchStats}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Refresh</span>
                </button>
              </div>

              {statsLoading ? (
                <div className="py-8 text-center text-xs text-slate-500">Loading live audit stream...</div>
              ) : !stats?.recentLogs || stats.recentLogs.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">No attendance punch logs recorded in database yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-medium">
                        <th className="pb-2">User / Account</th>
                        <th className="pb-2">Action</th>
                        <th className="pb-2">Punch Time (IST)</th>
                        <th className="pb-2">Source</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {stats.recentLogs.map((log: any) => (
                        <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 font-mono text-slate-200">{log.username}</td>
                          <td className="py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              log.action === 'In' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2.5 font-mono text-slate-300 text-[11px]">{log.punchTime}</td>
                          <td className="py-2.5 text-slate-400">
                            <span className="inline-flex items-center gap-1 text-[11px]">
                              {log.source === 'AUTOMATED_CRON' ? '⏰ Cron' : '👤 Manual'}
                            </span>
                          </td>
                          <td className="py-2.5">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                              log.status === 'SUCCESS' ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                              {log.status === 'SUCCESS' ? '✅ Success' : '❌ Failed'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Manual Trigger Card */}
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <span>Manual Multi-Tenant Punch Trigger</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">Execute automated cron check-in or check-out trigger on demand</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  shiftMode === 'In'
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  Current Shift: <strong className="font-bold">{shiftMode}</strong>
                </span>
              </div>

              <form onSubmit={handleTrigger} className="space-y-4">
                <div>
                  <label htmlFor="secret-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Cron Secret Key
                  </label>
                  <input
                    id="secret-input"
                    type="password"
                    placeholder="Enter process.env.CRON_SECRET"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <span>Processing Multi-Tenant Punch Trigger...</span>
                  ) : (
                    <span>Trigger All Active Tenant Punches ({shiftMode})</span>
                  )}
                </button>
              </form>

              {error && (
                <div className="mt-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs leading-relaxed">
                  Execution Error: {error}
                </div>
              )}

              {result && (
                <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
                  <div className="text-emerald-400 font-semibold">Processed {result.totalProcessed} Users Successfully</div>
                  <pre className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg text-[11px] font-mono text-slate-300 overflow-x-auto max-h-40">
                    {JSON.stringify(result.results, null, 2)}
                  </pre>
                </div>
              )}
            </div>

          </div>

          {/* Right Column - Integration Guides & System Rules */}
          <div className="space-y-6">

            {/* Telegram Bot Integration Card */}
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-xl">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Telegram Multi-Tenant Controls
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">Telegram Webhook URL</span>
                  <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl font-mono text-[11px] text-sky-400 break-all">
                    POST /api/telegram
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 space-y-1.5">
                  <span className="text-slate-400 block text-[11px]">User Commands & Features:</span>
                  <div className="bg-slate-950/60 p-2.5 rounded-xl font-mono text-[11px] text-slate-300 space-y-1">
                    <div className="text-emerald-400">/register <span className="text-slate-400">- Self-service onboarding</span></div>
                    <div className="text-teal-400">/mark <span className="text-slate-400">- Auto 9-hr punch in/out</span></div>
                    <div className="text-cyan-400">/stats <span className="text-slate-400">- Monthly work hours analytics</span></div>
                    <div className="text-purple-400">/myhistory <span className="text-slate-400">- MongoDB audit log history</span></div>
                    <div className="text-amber-400">/settings <span className="text-slate-400">- Profile & location config</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Shift Rules & Security Card */}
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-xl">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Security & 9-Hour Shift Engine
              </h3>

              <div className="space-y-2.5 text-xs text-slate-300">
                <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/60">
                  <span className="font-semibold text-white block mb-0.5">🔒 AES-256 Credential Security</span>
                  <p className="text-[11px] text-slate-400">HRone passwords are encrypted at rest in MongoDB and decrypted in-memory during gateway OAuth authentication.</p>
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/60">
                  <span className="font-semibold text-white block mb-0.5">⏱️ 9-Hour Shift Rule</span>
                  <p className="text-[11px] text-slate-400">Checks MongoDB `AttendanceLog` exclusively. Punch Out is only allowed after 9 hours have elapsed since Check-In.</p>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Footer */}
        <footer className="mt-12 text-center text-xs text-slate-500 border-t border-slate-800/60 pt-6">
          <p>HROne Multi-Tenant Automated Platform &bull; Cloud Gateway</p>
        </footer>
      </div>
    </main>
  );
}
