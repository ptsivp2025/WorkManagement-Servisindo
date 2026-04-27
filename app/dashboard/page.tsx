/// <reference types="vite/client" />
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// ── Supabase clients — lazy init agar tidak crash saat prerender Vercel ────────
let _supabase: ReturnType<typeof createClient> | null = null;
let _supabasePTS: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY belum diset');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function getSupabasePTS() {
  if (!_supabasePTS) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_PTS_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PTS_ANON_KEY;
    if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_PTS_URL / PTS_ANON_KEY belum diset');
    _supabasePTS = createClient(url, key);
  }
  return _supabasePTS;
}

interface User {
  id: string;
  username: string;
  password: string;
  full_name: string;
  role: string;
  phone_number?: string;
}

interface NotifItem {
  id: string;
  title: string;
  subtitle: string;
  type: 'ticket' | 'reminder';
}

// ─── Account Settings Modal ────────────────────────────────────────────────────
function AccountSettingsModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newUser, setNewUser] = useState({ username: '', password: '', full_name: '', role: 'team', phone_number: '' });
  const [notif, setNotif] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const notify = (type: 'success' | 'error', msg: string) => {
    setNotif({ type, msg });
    setTimeout(() => setNotif(null), 3000);
  };

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await (getSupabase().from('users') as any).select('*').order('full_name');
    if (data) setUsers(data as User[]);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newUser.username || !newUser.password || !newUser.full_name) { notify('error', 'Semua field wajib diisi!'); return; }
    setSaving(true);
    const { error } = await (getSupabase().from('users') as any).insert([newUser]);
    setSaving(false);
    if (error) { notify('error', 'Gagal: ' + error.message); return; }
    notify('success', 'Akun berhasil ditambahkan!');
    setNewUser({ username: '', password: '', full_name: '', role: 'team', phone_number: '' });
    setActiveTab('list');
    fetchUsers();
  };

  const handleSave = async () => {
    if (!editingUser) return;
    setSaving(true);
    const { error } = await (getSupabase().from('users') as any).update(editingUser).eq('id', editingUser.id);
    setSaving(false);
    if (error) { notify('error', 'Gagal: ' + error.message); return; }
    notify('success', 'Berhasil diperbarui!');
    setEditingUser(null);
    fetchUsers();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus akun ini?')) return;
    await (getSupabase().from('users') as any).delete().eq('id', id);
    notify('success', 'Akun dihapus.');
    fetchUsers();
  };

  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none';

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-slate-800">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden border border-slate-200">

        {/* Header */}
        <div className="px-7 py-5 flex items-center justify-between flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#b91c1c,#991b1b)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Account Settings</h2>
              <p className="text-white/60 text-xs">Kelola akun Team Services</p>
            </div>
          </div>
          <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {notif && (
          <div className={`mx-5 mt-4 px-4 py-3 rounded-lg text-sm font-semibold flex items-center gap-2 ${notif.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {notif.type === 'success' ? '✅' : '❌'} {notif.msg}
          </div>
        )}

        <div className="flex border-b border-slate-200 px-5 pt-4 flex-shrink-0">
          {(['list', 'add'] as const).map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setEditingUser(null); }}
              className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${activeTab === tab ? 'border-red-500 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {tab === 'list' ? '👥 Daftar Akun' : '➕ Tambah Akun'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'list' && (
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-4 border-slate-200 border-t-red-500 rounded-full animate-spin" />
                </div>
              ) : editingUser ? (
                <div className="space-y-4">
                  <button onClick={() => setEditingUser(null)} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm font-semibold">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    Kembali
                  </button>
                  {([['Full Name', 'full_name', 'text'], ['Username', 'username', 'text'], ['Password', 'password', 'password'], ['No. HP', 'phone_number', 'text']] as [string, string, string][]).map(([label, field, type]) => (
                    <div key={field}>
                      <label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">{label}</label>
                      <input type={type} value={(editingUser as any)[field] ?? ''} onChange={e => setEditingUser({ ...editingUser, [field]: e.target.value })} className={inp} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Role</label>
                    <select value={editingUser.role} onChange={e => setEditingUser({ ...editingUser, role: e.target.value })} className={inp + ' bg-white'}>
                      <option value="team">Team</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setEditingUser(null)} className="flex-1 border border-slate-300 text-slate-700 py-2.5 rounded-lg font-semibold hover:bg-slate-50 text-sm">Batal</button>
                    <button onClick={handleSave} disabled={saving}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                      {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      Simpan
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cari nama atau username..."
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-200 outline-none" />
                  </div>
                  {users.filter(u => u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.username?.toLowerCase().includes(searchQuery.toLowerCase())).map(user => (
                    <div key={user.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3 text-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 text-white"
                          style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                          {user.full_name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{user.full_name}</p>
                          <p className="text-xs text-slate-500">@{user.username} · <span className="font-semibold text-red-600">{user.role}</span></p>
                          {user.phone_number && <p className="text-xs text-slate-400">{user.phone_number}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingUser(user)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-all">Edit</button>
                        <button onClick={() => handleDelete(user.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-all">Hapus</button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {activeTab === 'add' && (
            <div className="space-y-4">
              {([['Full Name *', 'full_name', 'text', 'Nama lengkap'], ['Username *', 'username', 'text', 'username'], ['Password *', 'password', 'password', 'password'], ['No. HP', 'phone_number', 'text', '08xx..']] as [string,string,string,string][]).map(([label, field, type, ph]) => (
                <div key={field}>
                  <label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">{label}</label>
                  <input type={type} value={(newUser as any)[field] ?? ''} onChange={e => setNewUser({ ...newUser, [field]: e.target.value })} placeholder={ph} className={inp} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Role</label>
                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} className={inp + ' bg-white'}>
                  <option value="team">Team</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button onClick={handleAdd} disabled={saving}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2 mt-2">
                {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                ➕ Tambah Akun
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Notification Bell ─────────────────────────────────────────────────────────
function NotifBell({ items, onTicketClick, onReminderClick }: {
  items: NotifItem[];
  onTicketClick: () => void;
  onReminderClick: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl transition-all hover:bg-red-50 border border-transparent hover:border-red-200" title="Notifikasi">
        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {items.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-red-500 animate-pulse">
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full mt-2 right-0 z-[9999] rounded-2xl shadow-2xl overflow-hidden"
          style={{ width: 320, background: 'rgba(255,255,255,0.97)', border: '1.5px solid rgba(220,38,38,0.2)', backdropFilter: 'blur(16px)' }}>
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between" style={{ background: 'rgba(220,38,38,0.05)' }}>
            <span className="text-sm font-bold text-red-700">🔔 Notifikasi</span>
            {items.length > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-black text-white bg-red-500">{items.length}</span>}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2">
                <span className="text-3xl opacity-30">✅</span>
                <p className="text-xs text-slate-400 font-medium">Tidak ada notifikasi aktif</p>
              </div>
            ) : items.map(item => (
              <button key={item.id}
                onClick={() => { item.type === 'ticket' ? onTicketClick() : onReminderClick(); setOpen(false); }}
                className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 border-b border-slate-100/80 last:border-0 transition-colors">
                <span className="text-base mt-0.5">{item.type === 'ticket' ? '🎫' : '⏰'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{item.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function ServicesDashboard() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeMenu, setActiveMenu] = useState<'ticketing' | 'reminder'>('ticketing');
  const [iframeKey, setIframeKey] = useState(0);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);

  // ── Auth init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('svc_currentUser');
    const savedTime = localStorage.getItem('svc_loginTime');
    if (saved && savedTime) {
      const sixH = 6 * 60 * 60 * 1000;
      if (Date.now() - parseInt(savedTime) > sixH) {
        localStorage.removeItem('svc_currentUser');
        localStorage.removeItem('svc_loginTime');
      } else {
        try { setCurrentUser(JSON.parse(saved) as User); setIsLoggedIn(true); } catch { /* ignore */ }
      }
    }
    setInitializing(false);
  }, []);

  // ── Session timeout ────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const t = localStorage.getItem('svc_loginTime');
      if (t && Date.now() - parseInt(t) > 6 * 60 * 60 * 1000) {
        localStorage.removeItem('svc_currentUser');
        localStorage.removeItem('svc_loginTime');
        setIsLoggedIn(false); setCurrentUser(null);
      }
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, []);

  // ── Notifications ──────────────────────────────────────────────────────────
  const fetchNotifs = useCallback(async () => {
    if (!currentUser) return;
    const items: NotifItem[] = [];
    try {
      const { data } = await (getSupabasePTS().from('tickets') as any)
        .select('id, project_name, services_status')
        .eq('current_team', 'Team Services')
        .neq('services_status', 'Solved')
        .not('services_status', 'is', null)
        .limit(15);
      (data ?? []).forEach((t: any) =>
        items.push({ id: `t-${t.id}`, title: t.project_name, subtitle: `Status: ${t.services_status}`, type: 'ticket' }));
    } catch { /* ignore */ }
    try {
      const { data } = await (getSupabase().from('reminders') as any)
        .select('id, project_name, category, due_date')
        .neq('status', 'done').neq('status', 'cancelled')
        .order('due_date', { ascending: true }).limit(15);
      (data ?? []).forEach((r: any) =>
        items.push({ id: `r-${r.id}`, title: r.project_name, subtitle: `${r.category} · ${r.due_date}`, type: 'reminder' }));
    } catch { /* ignore */ }
    setNotifs(items);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    fetchNotifs();
    const iv = setInterval(fetchNotifs, 30000);
    return () => clearInterval(iv);
  }, [fetchNotifs, currentUser]);

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!loginForm.username || !loginForm.password) { setLoginError('Username dan password wajib diisi!'); return; }
    setLoginLoading(true); setLoginError('');
    try {
      const { data, error } = await (getSupabase().from('users') as any).select('*')
        .eq('username', loginForm.username).eq('password', loginForm.password).single();
      if (error || !data) { setLoginError('Username atau password salah!'); setLoginLoading(false); return; }
      const user = data as User;
      setCurrentUser(user); setIsLoggedIn(true);
      localStorage.setItem('svc_currentUser', JSON.stringify(user));
      localStorage.setItem('svc_loginTime', Date.now().toString());
    } catch { setLoginError('Login gagal. Coba lagi.'); }
    setLoginLoading(false);
  };

  const handleLogout = () => {
    setIsLoggedIn(false); setCurrentUser(null);
    localStorage.removeItem('svc_currentUser');
    localStorage.removeItem('svc_loginTime');
  };

  const handleNavClick = (menu: 'ticketing' | 'reminder') => {
    setActiveMenu(menu);
    setIframeKey(k => k + 1);
  };

  // ── Loading / Login ────────────────────────────────────────────────────────
  if (initializing) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="bg-white/10 backdrop-blur-sm p-10 rounded-2xl flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-white/20 border-t-red-500 rounded-full animate-spin" />
        <p className="text-sm font-semibold text-white/60">Loading portal...</p>
      </div>
    </div>
  );

  if (!isLoggedIn) return (
    <div className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ backgroundImage: 'url(/IVP_Background.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      {/* Dark overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'linear-gradient(135deg, rgba(15,23,42,0.82) 0%, rgba(30,30,30,0.78) 50%, rgba(26,5,5,0.82) 100%)'
      }} />
      {/* Subtle red glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at 30% 60%, rgba(220,38,38,0.12) 0%, transparent 60%), radial-gradient(ellipse at 75% 30%, rgba(220,38,38,0.07) 0%, transparent 50%)'
      }} />

      <div className="relative z-10 bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-8 w-full max-w-md"
        style={{ border: '1.5px solid rgba(220,38,38,0.25)' }}>

        {/* Logo on dark pill - ROUNDED REMOVED */}
        <div className="flex justify-center mb-6">
          <div className="px-7 py-4 shadow-xl" style={{ background: 'rgba(255,255,255,0.95)', border: '1.5px solid rgba(220,38,38,0.25)' }}>
            <img src="/logo-servisindo.png" alt="Servisindo Multimedia Service Center"
              style={{ height: '46px', width: 'auto', objectFit: 'contain' }} />
          </div>
        </div>

        <h1 className="text-xl font-black text-center text-slate-800 mb-1">Work Management Portal</h1>
        <p className="text-center text-slate-400 text-sm font-medium mb-6">Multimedia Service Center · Team Services</p>

        {loginError && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm font-semibold text-red-700">❌ {loginError}</div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-2 text-slate-500 tracking-widest uppercase">Username</label>
            <input type="text" value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 focus:ring-4 focus:ring-red-100 transition-all font-medium bg-white text-sm"
              placeholder="Masukkan username" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <div>
            <label className="block text-xs font-bold mb-2 text-slate-500 tracking-widest uppercase">Password</label>
            <input type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 focus:ring-4 focus:ring-red-100 transition-all font-medium bg-white text-sm"
              placeholder="Masukkan password" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <button onClick={handleLogin} disabled={loginLoading}
            className="w-full text-white py-3.5 rounded-xl font-bold shadow-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
            style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
            {loginLoading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</>
              : '🔐 Sign In to Portal'}
          </button>
        </div>

        <p className="text-center text-xs text-slate-300 mt-5">© 2026 Servisindo · Work Management System</p>
      </div>
    </div>
  );

  // ── Menu config ────────────────────────────────────────────────────────────
  const menuItems = [
    {
      key: 'ticketing' as const,
      label: 'Ticket Troubleshooting',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
      ),
      iframeUrl: '/ticketing-services',
      accent: '#dc2626',
      bg: 'rgba(220,38,38,0.09)',
      border: 'rgba(220,38,38,0.28)',
    },
    {
      key: 'reminder' as const,
      label: 'Reminder Schedule',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      iframeUrl: '/reminder-services',
      accent: '#b45309',
      bg: 'rgba(180,83,9,0.09)',
      border: 'rgba(180,83,9,0.28)',
    },
  ];

  const activeItem = menuItems.find(m => m.key === activeMenu)!;
  const ticketNotifCount = notifs.filter(n => n.type === 'ticket').length;
  const reminderNotifCount = notifs.filter(n => n.type === 'reminder').length;

  // ── Main Layout ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundImage: 'url(/IVP_Background.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(255,255,255,0.04)' }} />
      {showSettings && <AccountSettingsModal onClose={() => setShowSettings(false)} />}

      {/* ── HEADER ── */}
      <header className="flex-shrink-0 shadow-md" style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)', borderBottom: '2.5px solid #dc2626', zIndex: 999, position: 'relative' }}>
        <div className="w-full px-4 py-3 flex items-center justify-between gap-4">

          {/* LEFT: Logo - ROUNDED REMOVED */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="px-4 py-2 shadow-sm" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(220,38,38,0.2)' }}>
              <img src="/logo-servisindo.png" alt="Servisindo"
                style={{ height: '30px', width: 'auto', objectFit: 'contain' }} />
            </div>
            <div className="hidden md:block border-l border-slate-200 pl-3">
              <p className="text-[10px] font-bold tracking-widest uppercase text-red-600 leading-none">Work Management</p>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">Multimedia Service Center</p>
            </div>
          </div>

          {/* CENTER: Spacer */}
          <div className="flex-1" />

          {/* RIGHT: Notif + User + Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <NotifBell items={notifs} onTicketClick={() => handleNavClick('ticketing')} onReminderClick={() => handleNavClick('reminder')} />

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                {currentUser?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
              </div>
              <div className="leading-tight hidden sm:block">
                <p className="text-xs font-bold text-slate-800">{currentUser?.full_name}</p>
                <p className="text-[9px] font-bold tracking-widest uppercase text-red-600">{currentUser?.role}</p>
              </div>
            </div>

            {currentUser?.role === 'admin' && (
              <button onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.22)', color: '#b91c1c' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.14)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.07)'; }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}

            <button onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{ background: 'rgba(100,116,139,0.07)', border: '1px solid rgba(100,116,139,0.2)', color: '#475569' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(100,116,139,0.14)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(100,116,139,0.07)'; }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── BODY: SIDEBAR + IFRAME ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <aside
          className={`relative flex flex-col flex-shrink-0 transition-all duration-300 ${sidebarCollapsed ? 'w-[68px]' : 'w-[236px]'}`}
          style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)', boxShadow: '3px 0 18px rgba(0,0,0,0.1)', borderRight: '1px solid rgba(0,0,0,0.08)' }}>

          {/* Red accent top line */}
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg,transparent,#dc2626,transparent)' }} />

          {/* Sidebar header */}
          <div className={`flex items-center border-b px-3 py-4 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}
            style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-red-600 leading-none">Servisindo</p>
                  <p className="font-bold text-sm text-slate-800 leading-tight">SVC Portal</p>
                </div>
              </div>
            )}
            {sidebarCollapsed && (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
            )}
            {!sidebarCollapsed && (
              <button onClick={() => setSidebarCollapsed(true)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                </svg>
              </button>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" style={{ scrollbarWidth: 'none' }}>
            {!sidebarCollapsed && (
              <p className="px-1 mb-3 text-[10px] font-bold tracking-widest uppercase text-slate-400">Menu Utama</p>
            )}
            {menuItems.map(item => {
              const isActive = activeMenu === item.key;
              const notifCount = item.key === 'ticketing' ? ticketNotifCount : reminderNotifCount;
              return (
                <div key={item.key} className="group relative">
                  <button onClick={() => handleNavClick(item.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all ${sidebarCollapsed ? 'justify-center' : ''}`}
                    style={isActive
                      ? { background: item.bg, border: `1px solid ${item.border}`, color: item.accent }
                      : { background: 'transparent', border: '1px solid transparent', color: '#334155' }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.05)'; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: isActive ? `${item.accent}18` : 'rgba(0,0,0,0.06)', color: isActive ? item.accent : '#64748b' }}>
                      {item.icon}
                    </span>
                    {!sidebarCollapsed && (
                      <>
                        <span className="flex-1 text-left truncate tracking-wide">{item.label}</span>
                        {notifCount > 0 && (
                          <span className="min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                            style={{ background: item.accent }}>
                            {notifCount > 9 ? '9+' : notifCount}
                          </span>
                        )}
                        {isActive && notifCount === 0 && (
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: item.accent }} />
                        )}
                      </>
                    )}
                    {sidebarCollapsed && notifCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                        style={{ background: item.accent }}>
                        {notifCount}
                      </span>
                    )}
                  </button>
                  {/* Collapsed tooltip */}
                  {sidebarCollapsed && (
                    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      <div className="rounded-xl px-3 py-2 shadow-lg"
                        style={{ background: '#f8fafc', border: `1px solid ${item.border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                        <p className="text-xs font-bold" style={{ color: item.accent }}>{item.label}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Sidebar bottom */}
          <div className="p-3" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
            {sidebarCollapsed ? (
              <button onClick={() => setSidebarCollapsed(false)}
                className="w-full flex justify-center p-2 rounded-xl text-slate-400 hover:text-slate-600 transition-all"
                style={{ background: 'rgba(0,0,0,0.04)' }} title="Expand sidebar">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M6 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <div className="text-center">
                <p className="text-[10px] text-slate-300 font-medium">© 2026 Servisindo</p>
              </div>
            )}
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden" style={{ background: "transparent" }}>
            <iframe
              key={iframeKey}
              src={activeItem.iframeUrl}
              className="w-full h-full border-0"
              title={activeItem.label}
            />
          </div>

          {/* Footer — full width */}
          <div className="flex-shrink-0 bg-white/80 backdrop-blur-sm border-t border-slate-200">
            <div className="w-full px-6 py-3 flex items-center justify-center">
              <p className="text-slate-400 text-xs font-medium text-center tracking-wide">
                © 2026 Servisindo Multimedia Service Center — Work Management Support System
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
