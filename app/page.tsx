'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Live IST Time
  const [istTime, setIstTime] = useState<string>('');
  const [shiftMode, setShiftMode] = useState<'In' | 'Out'>('In');

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

      // Determine shift mode based on IST hour
      const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      setShiftMode(istDate.getHours() < 14 ? 'In' : 'Out');
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
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

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
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
                <h1 className="text-2xl font-bold tracking-tight text-white">HROne Bot</h1>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                  Active
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Automated Attendance & Punch Engine</p>
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

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column - Manual Trigger Card & Geo-location info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span>Manual Punch Trigger</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Execute check-in or check-out request on demand</p>
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
                  <div className="relative">
                    <input
                      id="secret-input"
                      type="password"
                      placeholder="Enter process.env.CRON_SECRET"
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-slate-950" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Processing Attendance Request...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>Mark Attendance Now ({shiftMode})</span>
                    </>
                  )}
                </button>
              </form>

              {/* Execution Result */}
              {error && (
                <div className="mt-5 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs leading-relaxed space-y-1">
                  <div className="font-semibold text-red-400 flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Execution Error
                  </div>
                  <div>{error}</div>
                </div>
              )}

              {result && (
                <div className="mt-5 p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Punch Recorded Successfully
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      Action: <strong className="text-slate-200">{result.action}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Punch Time</span>
                      <span className="font-mono text-slate-200 font-medium">{result.punchTime}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Status</span>
                      <span className="text-emerald-400 font-medium">{result.success ? 'Success (200 OK)' : 'Failed'}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">API Response Payload</span>
                    <pre className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg text-[11px] font-mono text-slate-300 overflow-x-auto max-h-40">
                      {JSON.stringify(result.response, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Configured Location & Coordinates Card */}
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-xl">
              <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Location & Geo-Fence Configuration
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl space-y-1">
                  <span className="text-slate-400 font-medium">Latitude</span>
                  <p className="font-mono text-slate-200 font-semibold">28.500385614012345</p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl space-y-1">
                  <span className="text-slate-400 font-medium">Longitude</span>
                  <p className="font-mono text-slate-200 font-semibold">77.41499672380527</p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl space-y-1 sm:col-span-2">
                  <span className="text-slate-400 font-medium">Geo Location Address</span>
                  <p className="text-slate-200 font-medium leading-relaxed">
                    210-211, altF Coworking Space, Sector 142, Noida, Uttar Pradesh 201304, India
                  </p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl space-y-1">
                  <span className="text-slate-400 font-medium">GPS Accuracy</span>
                  <p className="font-mono text-slate-200 font-semibold">10 meters</p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl space-y-1">
                  <span className="text-slate-400 font-medium">Attendance Source</span>
                  <p className="font-mono text-slate-200 font-semibold">Web Check-in (Online)</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - System Rules & Cron Automation Info */}
          <div className="space-y-6">

            {/* Cron & Endpoint Card */}
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-xl">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                API Endpoint & Integration
              </h3>
              
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">Automated Punch Webhook</span>
                  <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl font-mono text-[11px] text-emerald-400 break-all mb-2">
                    GET /api/attendance?secret=...
                  </div>
                  <span className="text-slate-400 block mb-1">15-Min Pre-Punch Alert Webhook</span>
                  <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl font-mono text-[11px] text-amber-400 break-all">
                    GET /api/alert?secret=...
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <span className="text-slate-400 block text-[11px]">Automatic Action Rules:</span>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded-lg text-[11px]">
                      <span className="text-slate-300">Before 02:00 PM IST</span>
                      <span className="font-bold text-blue-400">Punch IN</span>
                    </div>
                    <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded-lg text-[11px]">
                      <span className="text-slate-300">After 02:00 PM IST</span>
                      <span className="font-bold text-amber-400">Punch OUT</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Telegram Bot Integration Card */}
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-xl">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Telegram Bot Integration
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">Telegram Webhook URL</span>
                  <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl font-mono text-[11px] text-sky-400 break-all">
                    POST /api/telegram
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 space-y-1.5">
                  <span className="text-slate-400 block text-[11px]">Bot Commands & Buttons:</span>
                  <div className="bg-slate-950/60 p-2.5 rounded-xl font-mono text-[11px] text-slate-300 space-y-1">
                    <div className="text-emerald-400">/mark <span className="text-slate-400">- Punch attendance</span></div>
                    <div className="text-purple-400">/history <span className="text-slate-400">- View attendance logs</span></div>
                    <div className="text-sky-400">/status <span className="text-slate-400">- System & shift status</span></div>
                    <div className="text-blue-400">/help <span className="text-slate-400">- Display menu</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Account Settings Status */}
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-xl">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                HR One Environment
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Domain</span>
                  <span className="font-mono text-slate-200">uharvest</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Target Endpoint</span>
                  <span className="font-mono text-slate-200 text-[11px]">app.hrone.cloud</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Auth Method</span>
                  <span className="font-mono text-slate-200 text-[11px]">OAuth2 Password Flow</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-400">Timezone</span>
                  <span className="font-mono text-slate-200 text-[11px]">Asia/Kolkata (IST)</span>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Footer */}
        <footer className="mt-12 text-center text-xs text-slate-500 border-t border-slate-800/60 pt-6">
          <p>HR One Automated Attendance System &bull; Secure Cloud Gateway</p>
        </footer>
      </div>
    </main>
  );
}
