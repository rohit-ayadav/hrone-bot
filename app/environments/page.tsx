'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';

export interface ServiceEnvironment {
  id: string;
  name: string;
  category: string;
  description?: string;
  devUrl: string;
  qaUrl: string;
  prodUrl: string;
  localUrl?: string;
  tags?: string[];
  sortOrder?: number;
  updatedAt?: string;
}

export default function EnvironmentsPage() {
  const [services, setServices] = useState<ServiceEnvironment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [envFilter, setEnvFilter] = useState<'All' | 'DEV' | 'QA' | 'PROD'>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingService, setEditingService] = useState<ServiceEnvironment | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<ServiceEnvironment>>({
    name: '',
    category: 'Web Apps',
    description: '',
    devUrl: '',
    qaUrl: '',
    prodUrl: '',
    localUrl: '',
    tags: [],
  });
  const [tagInput, setTagInput] = useState('');

  // Notification Toast
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  // Fetch Services from Database API
  const fetchServicesFromDb = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/environments');
      const data = await res.json();

      if (res.ok && data.success) {
        setServices(data.services || []);
      } else {
        showToast(data.error || 'Failed to load websites', 'error');
      }
    } catch (err: any) {
      console.error('Failed to load services:', err);
      showToast('Error connecting to database', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchServicesFromDb();
  }, [fetchServicesFromDb]);

  // Keyboard shortcut Ctrl+K or / to search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('hub-search-input')?.focus();
      }
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const copyToClipboard = (url: string, idKey: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedId(idKey);
    setTimeout(() => setCopiedId(null), 1800);
    showToast(`Copied URL: ${url}`);
  };

  const handleOpenAddModal = () => {
    setEditingService(null);
    setFormData({
      name: '',
      category: 'Web Apps',
      description: '',
      devUrl: '',
      qaUrl: '',
      prodUrl: '',
      localUrl: '',
      tags: [],
    });
    setTagInput('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (svc: ServiceEnvironment) => {
    setEditingService(svc);
    setFormData({ ...svc });
    setTagInput(svc.tags?.join(', ') || '');
    setIsModalOpen(true);
  };

  // Delete from MongoDB
  const handleDeleteService = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}" from MongoDB database?`)) return;

    try {
      const res = await fetch(`/api/environments?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setServices((prev) => prev.filter((s) => s.id !== id));
        showToast(`Deleted "${name}" from Database`);
      } else {
        throw new Error(data.error || 'Failed to delete');
      }
    } catch (err: any) {
      showToast(err.message || 'Delete failed', 'error');
    }
  };

  // Save / Update to MongoDB
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      showToast('Please enter a service name', 'error');
      return;
    }

    const processedTags = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    setIsSubmitting(true);

    try {
      if (editingService) {
        // PUT update in MongoDB
        const res = await fetch('/api/environments', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingService.id,
            name: formData.name.trim(),
            category: formData.category || 'Web Apps',
            description: formData.description?.trim() || '',
            devUrl: formData.devUrl?.trim() || '',
            qaUrl: formData.qaUrl?.trim() || '',
            prodUrl: formData.prodUrl?.trim() || '',
            localUrl: formData.localUrl?.trim() || '',
            tags: processedTags,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setServices((prev) =>
            prev.map((s) => (s.id === editingService.id ? data.service : s))
          );
          showToast(`Updated "${formData.name}" in Database!`);
          setIsModalOpen(false);
        } else {
          throw new Error(data.error || 'Failed to update in DB');
        }
      } else {
        // POST create in MongoDB
        const res = await fetch('/api/environments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name.trim(),
            category: formData.category || 'Web Apps',
            description: formData.description?.trim() || '',
            devUrl: formData.devUrl?.trim() || '',
            qaUrl: formData.qaUrl?.trim() || '',
            prodUrl: formData.prodUrl?.trim() || '',
            localUrl: formData.localUrl?.trim() || '',
            tags: processedTags,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setServices((prev) => [data.service, ...prev]);
          showToast(`Added "${data.service.name}" to MongoDB!`);
          setIsModalOpen(false);
        } else {
          throw new Error(data.error || 'Failed to create in DB');
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Operation failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(services, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `office-environments-db-backup-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Exported MongoDB records as JSON');
  };

  const handleOpenAllInEnv = (env: 'devUrl' | 'qaUrl' | 'prodUrl', label: string) => {
    const urlsToOpen = filteredServices
      .map((s) => s[env])
      .filter((url): url is string => Boolean(url && url.startsWith('http')));

    if (urlsToOpen.length === 0) {
      showToast(`No active ${label} URLs found to open.`, 'error');
      return;
    }

    if (urlsToOpen.length > 6) {
      const proceed = window.confirm(
        `This will open ${urlsToOpen.length} tabs in ${label}. Continue?`
      );
      if (!proceed) return;
    }

    urlsToOpen.forEach((url) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
    showToast(`Opened ${urlsToOpen.length} ${label} URLs in new tabs!`);
  };

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return ['All', ...Array.from(set)];
  }, [services]);

  // Filtered Services
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      if (selectedCategory !== 'All' && s.category !== selectedCategory) {
        return false;
      }

      if (envFilter === 'DEV' && !s.devUrl) return false;
      if (envFilter === 'QA' && !s.qaUrl) return false;
      if (envFilter === 'PROD' && !s.prodUrl) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesDesc = s.description?.toLowerCase().includes(q);
        const matchesDev = s.devUrl?.toLowerCase().includes(q);
        const matchesQa = s.qaUrl?.toLowerCase().includes(q);
        const matchesProd = s.prodUrl?.toLowerCase().includes(q);
        const matchesTags = s.tags?.some((t) => t.toLowerCase().includes(q));
        const matchesCat = s.category?.toLowerCase().includes(q);

        return matchesName || matchesDesc || matchesDev || matchesQa || matchesProd || matchesTags || matchesCat;
      }

      return true;
    });
  }, [services, selectedCategory, envFilter, searchQuery]);

  // Count metrics
  const totalUrlsCount = useMemo(() => {
    let count = 0;
    services.forEach((s) => {
      if (s.devUrl) count++;
      if (s.qaUrl) count++;
      if (s.prodUrl) count++;
      if (s.localUrl) count++;
    });
    return count;
  }, [services]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans relative selection:bg-cyan-500 selection:text-slate-950 pb-20">
      {/* Dynamic Background Atmosphere */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/4 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Floating Notification */}
      {notification && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md transition-all animate-bounce ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700/60 shadow-emerald-950/50'
              : 'bg-rose-950/90 text-rose-300 border-rose-700/60 shadow-rose-950/50'
          }`}
        >
          {notification.type === 'success' ? (
            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span>{notification.message}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {/* Top Breadcrumb & Switcher Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 mb-6 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
              <Link href="/" className="hover:text-cyan-400 transition-colors flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span>HROne Bot Home</span>
              </Link>
              <span>/</span>
              <span className="text-cyan-400 font-semibold">Environment Portal</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/20">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                  />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Office Environments Hub</h1>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono">
                    {services.length} Services ({totalUrlsCount} URLs)
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Single-click launcher & switcher for Dev, QA, and Production environments
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons: Add & Export */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleOpenAddModal}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 transition-all hover:scale-105 active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>Add Website</span>
            </button>

            <button
              onClick={handleExportJson}
              title="Backup your URLs as a JSON file"
              className="bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/80 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all"
            >
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span>Export</span>
            </button>
          </div>
        </header>

        {/* Search, Environment Toggle & Filter Bar */}
        <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 shadow-xl mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                id="hub-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search DIT Keycloak, CMS, APIs, URLs, tags (Press Ctrl+K or /)..."
                className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-10 pr-24 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-10 pr-2 flex items-center text-slate-400 hover:text-white"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : null}
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded shadow">
                  Ctrl+K
                </kbd>
              </div>
            </div>

            {/* Quick Environment Filter Mode */}
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 shrink-0">
              <span className="text-[11px] font-semibold text-slate-400 px-2">Focus:</span>
              {(['All', 'DEV', 'QA', 'PROD'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setEnvFilter(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    envFilter === mode
                      ? mode === 'DEV'
                        ? 'bg-sky-500 text-slate-950 shadow-sm'
                        : mode === 'QA'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : mode === 'PROD'
                        ? 'bg-rose-500 text-white shadow-sm'
                        : 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Category Chips & Bulk Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
            {/* Category pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <span className="text-[11px] text-slate-500 font-medium mr-1 shrink-0">Category:</span>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition-all ${
                    selectedCategory === cat
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-slate-800/40 text-slate-400 border border-slate-800 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Bulk Launch Buttons */}
            <div className="flex items-center gap-2 text-xs shrink-0 self-end sm:self-center">
              <span className="text-[11px] text-slate-500 font-medium">Batch Launch:</span>
              <button
                onClick={() => handleOpenAllInEnv('devUrl', 'DEV')}
                className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                title="Open all visible DEV websites in new tabs"
              >
                Launch Devs
              </button>
              <button
                onClick={() => handleOpenAllInEnv('qaUrl', 'QA')}
                className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                title="Open all visible QA websites in new tabs"
              >
                Launch QAs
              </button>
            </div>
          </div>
        </div>

        {/* Results Counter */}
        <div className="flex items-center justify-between text-xs text-slate-400 mb-4 px-1">
          <div>
            Showing <span className="font-semibold text-white">{filteredServices.length}</span> of {services.length}{' '}
            services
            {searchQuery && (
              <span>
                {' '}
                matching &quot;<span className="text-cyan-400">{searchQuery}</span>&quot;
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500">
            Stored in database &bull; Single source of truth
          </div>
        </div>

        {/* Loading Spinner */}
        {isLoading && services.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 space-y-4">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400">Loading environments from MongoDB database...</p>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-12 text-center">
            <svg
              className="w-12 h-12 text-slate-600 mx-auto mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-base font-semibold text-white mb-1">No matching services found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
              Try adjusting your search terms or filters, or click &quot;Add to DB&quot; to add a new URL.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
                setEnvFilter('All');
              }}
              className="bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 px-4 py-2 rounded-xl border border-slate-700 font-medium transition-all"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredServices.map((svc) => (
              <div
                key={svc.id}
                className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/90 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition-all hover:shadow-cyan-950/20 hover:shadow-xl group"
              >
                {/* Header: Title, Category, Edit/Delete */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                          {svc.name}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800/90 text-slate-300 border border-slate-700/70">
                          {svc.category}
                        </span>
                        {svc.tags?.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-950 text-slate-400 border border-slate-800"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Card Actions (Edit, Delete) */}
                    <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleOpenEditModal(svc)}
                        title="Edit Website"
                        className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteService(svc.id, svc.name)}
                        title="Delete Website"
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {svc.description && (
                    <p className="text-xs text-slate-400 line-clamp-2 mt-1 mb-4 leading-relaxed">
                      {svc.description}
                    </p>
                  )}
                </div>

                {/* Environment Launch Matrix */}
                <div className="space-y-2 mt-3 pt-3 border-t border-slate-800/80">
                  {/* DEV ROW */}
                  <div
                    className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                      svc.devUrl
                        ? 'bg-slate-950/60 border-slate-800/80 hover:border-sky-500/40'
                        : 'bg-slate-950/20 border-dashed border-slate-800/40 opacity-40'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                        DEV
                      </span>
                      <span
                        className="text-xs text-slate-300 font-mono truncate max-w-[150px] sm:max-w-[180px]"
                        title={svc.devUrl || 'Not configured'}
                      >
                        {svc.devUrl ? svc.devUrl.replace(/^https?:\/\//, '') : 'None'}
                      </span>
                    </div>

                    {svc.devUrl ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => copyToClipboard(svc.devUrl, `${svc.id}-dev`)}
                          title="Copy DEV URL"
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 text-[11px] transition-colors"
                        >
                          {copiedId === `${svc.id}-dev` ? (
                            <span className="text-emerald-400 text-[10px] font-semibold">✓</span>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          )}
                        </button>
                        <a
                          href={svc.devUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 transition-all shadow-sm"
                        >
                          <span>Open</span>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2.5}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      </div>
                    ) : null}
                  </div>

                  {/* QA ROW */}
                  <div
                    className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                      svc.qaUrl
                        ? 'bg-slate-950/60 border-slate-800/80 hover:border-amber-500/40'
                        : 'bg-slate-950/20 border-dashed border-slate-800/40 opacity-40'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        QA
                      </span>
                      <span
                        className="text-xs text-slate-300 font-mono truncate max-w-[150px] sm:max-w-[180px]"
                        title={svc.qaUrl || 'Not configured'}
                      >
                        {svc.qaUrl ? svc.qaUrl.replace(/^https?:\/\//, '') : 'None'}
                      </span>
                    </div>

                    {svc.qaUrl ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => copyToClipboard(svc.qaUrl, `${svc.id}-qa`)}
                          title="Copy QA URL"
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 text-[11px] transition-colors"
                        >
                          {copiedId === `${svc.id}-qa` ? (
                            <span className="text-emerald-400 text-[10px] font-semibold">✓</span>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          )}
                        </button>
                        <a
                          href={svc.qaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 transition-all shadow-sm"
                        >
                          <span>Open</span>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2.5}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      </div>
                    ) : null}
                  </div>

                  {/* PROD ROW */}
                  <div
                    className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                      svc.prodUrl
                        ? 'bg-slate-950/60 border-slate-800/80 hover:border-emerald-500/40'
                        : 'bg-slate-950/20 border-dashed border-slate-800/40 opacity-40'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        PROD
                      </span>
                      <span
                        className="text-xs text-slate-300 font-mono truncate max-w-[150px] sm:max-w-[180px]"
                        title={svc.prodUrl || 'Not configured'}
                      >
                        {svc.prodUrl ? svc.prodUrl.replace(/^https?:\/\//, '') : 'None'}
                      </span>
                    </div>

                    {svc.prodUrl ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => copyToClipboard(svc.prodUrl, `${svc.id}-prod`)}
                          title="Copy PROD URL"
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 text-[11px] transition-colors"
                        >
                          {copiedId === `${svc.id}-prod` ? (
                            <span className="text-emerald-400 text-[10px] font-semibold">✓</span>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          )}
                        </button>
                        <a
                          href={svc.prodUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 transition-all shadow-sm"
                        >
                          <span>Open</span>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2.5}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      </div>
                    ) : null}
                  </div>

                  {/* Optional Localhost Link */}
                  {svc.localUrl ? (
                    <div className="flex items-center justify-between px-2 py-1 text-[11px] text-slate-400">
                      <span className="text-[10px] font-mono text-slate-500">Local: {svc.localUrl}</span>
                      <a
                        href={svc.localUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:underline text-[10px] font-medium"
                      >
                        Launch Local &rarr;
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Service Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingService ? 'Edit Website / Service' : 'Add New Website'}
                  </h3>
                  <p className="text-[11px] text-slate-400">Saved directly to database</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveService} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Website / Service Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DIT Keycloak, Customer Web, DIT CMS Service"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Category</label>
                  <select
                    value={formData.category || 'Web Apps'}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="Web Apps">Web Apps</option>
                    <option value="Auth & Security">Auth & Security</option>
                    <option value="APIs & Services">APIs & Services</option>
                    <option value="Admin & Ops">Admin & Ops</option>
                    <option value="Tools & Infrastructure">Tools & Infrastructure</option>
                    <option value="External / Vendors">External / Vendors</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Tags (comma separated)</label>
                  <input
                    type="text"
                    placeholder="Keycloak, Identity, Azure, SSO"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Identity and access management, Azure Container Apps"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Environment URLs
                </span>

                <div>
                  <label className="block text-sky-400 font-semibold mb-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-400" />
                    DEV URL
                  </label>
                  <input
                    type="text"
                    placeholder="https://dit-identity-dev.victorioussky-c561900e.centralindia.azurecontainerapps.io/"
                    value={formData.devUrl || ''}
                    onChange={(e) => setFormData({ ...formData, devUrl: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-amber-400 font-semibold mb-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    QA / Staging URL
                  </label>
                  <input
                    type="text"
                    placeholder="https://identity-service-qa.happyrock-1236a00b.centralindia.azurecontainerapps.io/"
                    value={formData.qaUrl || ''}
                    onChange={(e) => setFormData({ ...formData, qaUrl: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-emerald-400 font-semibold mb-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Production (PROD) URL
                  </label>
                  <input
                    type="text"
                    placeholder="https://dit-identity-production.yellowbeach-a8e8372c.centralindia.azurecontainerapps.io/"
                    value={formData.prodUrl || ''}
                    onChange={(e) => setFormData({ ...formData, prodUrl: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Localhost URL (Optional)</label>
                  <input
                    type="text"
                    placeholder="http://localhost:8080"
                    value={formData.localUrl || ''}
                    onChange={(e) => setFormData({ ...formData, localUrl: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-2 rounded-xl shadow-lg shadow-cyan-500/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingService ? 'Save Changes' : 'Add Website'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
