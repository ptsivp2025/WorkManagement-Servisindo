'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// ── Supabase clients — lazy init ─────────────────────────────────────────────
let _supabase: ReturnType<typeof createClient> | null = null;
let _supabasePTS: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('SUPABASE env not set');
    _supabase = createClient(url, key);
  }
  return _supabase;
}
function getSupabasePTS() {
  if (!_supabasePTS) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_PTS_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PTS_ANON_KEY;
    if (!url || !key) throw new Error('SUPABASE_PTS env not set');
    _supabasePTS = createClient(url, key);
  }
  return _supabasePTS;
}

interface User {
  id: string; username: string; password: string;
  full_name: string; role: string; phone_number?: string;
  approved?: boolean;
}
interface NotifItem {
  id: string; title: string; subtitle: string; type: 'ticket' | 'reminder';
}

// ── Account Settings Modal ────────────────────────────────────────────────────
function AccountSettingsModal({ onClose }: { onClose: () => void }) {
  const supabase = getSupabase();
  const [users, setUsers] = useState<User[]>([]);
  const [pending, setPending] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'pending'>('list');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const notify = (type: 'success' | 'error', msg: string) => { setNotif({ type, msg }); setTimeout(() => setNotif(null), 3000); };

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const { data: all } = await supabase.from('users').select('*').order('full_name');
    const approved = (all ?? []).filter((u: User) => u.approved !== false);
    const pend = (all ?? []).filter((u: User) => u.approved === false);
    setUsers(approved as User[]);
    setPending(pend as User[]);
    setLoading(false);
  };

  const handleApprove = async (user: User) => {
    setSaving(true);
    await supabase.from('users').update({ approved: true }).eq('id', user.id);
    notify('success', `${user.full_name} disetujui!`);
    fetchAll(); setSaving(false);
  };

  const handleReject = async (user: User) => {
    if (!confirm(`Tolak dan hapus akun ${user.full_name}?`)) return;
    await supabase.from('users').delete().eq('id', user.id);
    notify('success', 'Akun ditolak dan dihapus.');
    fetchAll();
  };

  const handleSave = async () => {
    if (!editingUser) return;
    setSaving(true);
    const { error } = await supabase.from('users').update(editingUser).eq('id', editingUser.id);
    setSaving(false);
    if (error) { notify('error', 'Gagal: ' + error.message); return; }
    notify('success', 'Berhasil diperbarui!'); setEditingUser(null); fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus akun ini?')) return;
    await supabase.from('users').delete().eq('id', id);
    notify('success', 'Akun dihapus.'); fetchAll();
  };

  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none';

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ background: 'linear-gradient(135deg,#b91c1c,#991b1b)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Account Settings</h2>
              {pending.length > 0 && <p className="text-red-200 text-[10px]">{pending.length} akun menunggu approval</p>}
            </div>
          </div>
          <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {notif && <div className={`mx-4 mt-3 px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 ${notif.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{notif.type === 'success' ? '✅' : '❌'} {notif.msg}</div>}

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-4 pt-3 flex-shrink-0">
          {([['list', '👥 Akun Aktif'], ['pending', `⏳ Pending ${pending.length > 0 ? `(${pending.length})` : ''}`]] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => { setActiveTab(tab); setEditingUser(null); }}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${activeTab === tab ? 'border-red-500 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-slate-200 border-t-red-500 rounded-full animate-spin" /></div>
          ) : activeTab === 'pending' ? (
            pending.length === 0 ? (
              <div className="text-center py-12"><div className="text-4xl mb-3">✅</div><p className="text-slate-400 font-medium text-sm">Tidak ada akun menunggu approval</p></div>
            ) : pending.map(user => (
              <div key={user.id} className="rounded-xl p-4 border border-orange-200 bg-orange-50/80">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-800">{user.full_name}</p>
                    <p className="text-xs text-slate-500">@{user.username} · <span className="font-semibold text-orange-600">{user.role}</span></p>
                    {user.phone_number && <p className="text-xs text-slate-400">{user.phone_number}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleApprove(user)} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">✅ Setujui</button>
                    <button onClick={() => handleReject(user)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200">✕ Tolak</button>
                  </div>
                </div>
              </div>
            ))
          ) : editingUser ? (
            <div className="space-y-3">
              <button onClick={() => setEditingUser(null)} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-semibold">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Kembali
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
                  <option value="guest">Guest</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditingUser(null)} className="flex-1 border border-slate-300 text-slate-700 py-2.5 rounded-xl font-semibold hover:bg-slate-50 text-sm">Batal</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2">{saving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}Simpan</button>
              </div>
            </div>
          ) : (
            users.map(user => (
              <div key={user.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 text-white" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                    {user.full_name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{user.full_name}</p>
                    <p className="text-xs text-slate-500">@{user.username} · <span className="font-semibold text-red-600">{user.role}</span></p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingUser(user)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">Edit</button>
                  <button onClick={() => handleDelete(user.id)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200">Hapus</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Notification Bell (hanya di ticketing header) ─────────────────────────────
function NotifBell({ items, onTicketClick, onReminderClick }: {
  items: NotifItem[]; onTicketClick: () => void; onReminderClick: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="relative p-2 rounded-xl transition-all hover:bg-red-50 border border-transparent hover:border-red-200" title="Notifikasi">
        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {items.length > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white bg-red-500 animate-pulse">{items.length > 9 ? '9+' : items.length}</span>}
      </button>
      {open && (
        <div className="absolute top-full mt-2 right-0 z-[9999] rounded-2xl shadow-2xl overflow-hidden" style={{ width: 300, background: 'rgba(255,255,255,0.97)', border: '1.5px solid rgba(220,38,38,0.2)', backdropFilter: 'blur(16px)' }}>
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between" style={{ background: 'rgba(220,38,38,0.05)' }}>
            <span className="text-sm font-bold text-red-700">🔔 Notifikasi</span>
            {items.length > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-black text-white bg-red-500">{items.length}</span>}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2"><span className="text-3xl opacity-30">✅</span><p className="text-xs text-slate-400 font-medium">Tidak ada notifikasi</p></div>
            ) : items.map(item => (
              <button key={item.id} onClick={() => { item.type === 'ticket' ? onTicketClick() : onReminderClick(); setOpen(false); }}
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

// ── Main Dashboard ─────────────────────────────────────────────────────────────
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

  // Register form
  const [showRegister, setShowRegister] = useState(false);
  const [registerForm, setRegisterForm] = useState({ full_name: '', username: '', password: '', role: 'team', phone_number: '' });
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [registerError, setRegisterError] = useState('');

  // ── Auth init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('svc_currentUser');
    const savedTime = localStorage.getItem('svc_loginTime');
    if (saved && savedTime) {
      const sixH = 6 * 60 * 60 * 1000;
      if (Date.now() - parseInt(savedTime) > sixH) {
        localStorage.removeItem('svc_currentUser'); localStorage.removeItem('svc_loginTime');
      } else {
        try { setCurrentUser(JSON.parse(saved) as User); setIsLoggedIn(true); } catch {}
      }
    }
    setInitializing(false);
  }, []);

  useEffect(() => {
    const check = () => {
      const t = localStorage.getItem('svc_loginTime');
      if (t && Date.now() - parseInt(t) > 6 * 60 * 60 * 1000) {
        localStorage.removeItem('svc_currentUser'); localStorage.removeItem('svc_loginTime');
        setIsLoggedIn(false); setCurrentUser(null);
      }
    };
    check(); const iv = setInterval(check, 60000); return () => clearInterval(iv);
  }, []);

  const fetchNotifs = useCallback(async () => {
    if (!currentUser) return;
    const items: NotifItem[] = [];
    try {
      const pts = getSupabasePTS();
      const { data } = await pts.from('tickets').select('id, project_name, services_status')
        .eq('current_team', 'Team Services').neq('services_status', 'Solved').limit(15);
      (data ?? []).forEach((t: any) => items.push({ id: `t-${t.id}`, title: t.project_name, subtitle: `Status: ${t.services_status}`, type: 'ticket' }));
    } catch {}
    try {
      const supabase = getSupabase();
      const { data } = await supabase.from('reminders').select('id, project_name, category, due_date')
        .neq('status', 'done').neq('status', 'cancelled').order('due_date', { ascending: true }).limit(15);
      (data ?? []).forEach((r: any) => items.push({ id: `r-${r.id}`, title: r.project_name, subtitle: `${r.category} · ${r.due_date}`, type: 'reminder' }));
    } catch {}
    setNotifs(items);
  }, [currentUser]);

  useEffect(() => { if (!currentUser) return; fetchNotifs(); const iv = setInterval(fetchNotifs, 30000); return () => clearInterval(iv); }, [fetchNotifs, currentUser]);

  const handleLogin = async () => {
    if (!loginForm.username || !loginForm.password) { setLoginError('Username dan password wajib diisi!'); return; }
    setLoginLoading(true); setLoginError('');
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.from('users').select('*')
        .eq('username', loginForm.username).eq('password', loginForm.password).single();
      if (error || !data) { setLoginError('Username atau password salah!'); setLoginLoading(false); return; }
      const user = data as User;
      // Check approval status
      if (user.approved === false) { setLoginError('Akun Anda sedang menunggu persetujuan admin.'); setLoginLoading(false); return; }
      setCurrentUser(user); setIsLoggedIn(true);
      localStorage.setItem('svc_currentUser', JSON.stringify(user)); localStorage.setItem('svc_loginTime', Date.now().toString());
    } catch { setLoginError('Login gagal. Coba lagi.'); }
    setLoginLoading(false);
  };

  const handleRegister = async () => {
    const { full_name, username, password, role, phone_number } = registerForm;
    if (!full_name.trim() || !username.trim() || !password.trim()) { setRegisterError('Nama, username, dan password wajib diisi!'); return; }
    setRegisterLoading(true); setRegisterError('');
    try {
      const supabase = getSupabase();
      // Check username taken
      const { data: existing } = await supabase.from('users').select('id').eq('username', username.trim()).maybeSingle();
      if (existing) { setRegisterError('Username sudah digunakan!'); setRegisterLoading(false); return; }
      const { error } = await supabase.from('users').insert([{
        full_name: full_name.trim(), username: username.trim(), password,
        role, phone_number: phone_number.trim() || null, approved: false,
      }]);
      if (error) { setRegisterError('Gagal mendaftar: ' + error.message); setRegisterLoading(false); return; }
      setRegisterSuccess(true);
    } catch { setRegisterError('Gagal mendaftar. Coba lagi.'); }
    setRegisterLoading(false);
  };

  const handleLogout = () => {
    setIsLoggedIn(false); setCurrentUser(null);
    localStorage.removeItem('svc_currentUser'); localStorage.removeItem('svc_loginTime');
  };

  const handleNavClick = (menu: 'ticketing' | 'reminder') => { setActiveMenu(menu); setIframeKey(k => k + 1); };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (initializing) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="bg-white/10 p-10 rounded-2xl flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-white/20 border-t-red-500 rounded-full animate-spin" />
        <p className="text-sm font-semibold text-white/60">Loading portal...</p>
      </div>
    </div>
  );

  // ── Login / Register Page ───────────────────────────────────────────────────
  if (!isLoggedIn) return (
    <div className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ backgroundImage: 'url(/IVP_Background.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg,rgba(15,23,42,0.82),rgba(30,30,30,0.78),rgba(26,5,5,0.82))' }} />
      <div className="relative z-10 bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl w-full max-w-md" style={{ border: '1.5px solid rgba(220,38,38,0.25)' }}>

        {/* Tab toggle */}
        <div className="flex border-b border-slate-200">
          <button onClick={() => { setShowRegister(false); setRegisterSuccess(false); setRegisterError(''); }}
            className={`flex-1 py-3.5 text-sm font-bold rounded-tl-3xl transition-all ${!showRegister ? 'bg-white text-red-600' : 'bg-slate-50 text-slate-400 hover:text-slate-600'}`}>
            🔐 Sign In
          </button>
          <button onClick={() => { setShowRegister(true); setLoginError(''); }}
            className={`flex-1 py-3.5 text-sm font-bold rounded-tr-3xl transition-all ${showRegister ? 'bg-white text-red-600' : 'bg-slate-50 text-slate-400 hover:text-slate-600'}`}>
            📝 Register
          </button>
        </div>

        <div className="p-8">
          {/* Logo */}
          <div className="flex justify-center mb-5">
            <img src="/logo-servisindo.png" alt="Servisindo" style={{ height: '46px', width: 'auto', objectFit: 'contain' }} />
          </div>

          {!showRegister ? (
            /* ── LOGIN FORM ── */
            <>
              <h1 className="text-xl font-black text-center text-slate-800 mb-1">Work Management Portal</h1>
              <p className="text-center text-slate-400 text-sm font-medium mb-6">Multimedia Service Center · Team Services</p>
              {loginError && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm font-semibold text-red-700">❌ {loginError}</div>}
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
                  {loginLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</> : '🔐 Sign In to Portal'}
                </button>
              </div>
              <p className="text-center text-xs text-slate-300 mt-5">© 2026 Servisindo · Work Management System</p>
            </>
          ) : registerSuccess ? (
            /* ── REGISTER SUCCESS ── */
            <div className="text-center py-4">
              <div className="text-5xl mb-4">⏳</div>
              <h2 className="text-xl font-black text-slate-800 mb-2">Pendaftaran Terkirim!</h2>
              <p className="text-slate-500 text-sm mb-6 leading-relaxed">Akun Anda sedang menunggu persetujuan dari Admin. Setelah disetujui, Anda dapat login ke portal.</p>
              <button onClick={() => { setShowRegister(false); setRegisterSuccess(false); setRegisterForm({ full_name: '', username: '', password: '', role: 'team', phone_number: '' }); }}
                className="px-6 py-3 rounded-xl font-bold text-white text-sm" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                Kembali ke Login
              </button>
            </div>
          ) : (
            /* ── REGISTER FORM ── */
            <>
              <h1 className="text-xl font-black text-center text-slate-800 mb-1">Daftar Akun</h1>
              <p className="text-center text-slate-400 text-sm font-medium mb-5">Akun akan aktif setelah disetujui Admin</p>
              {registerError && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm font-semibold text-red-700">❌ {registerError}</div>}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold mb-1.5 text-slate-500 tracking-widest uppercase">Full Name *</label>
                  <input value={registerForm.full_name} onChange={e => setRegisterForm({ ...registerForm, full_name: e.target.value })}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 focus:border-red-500 focus:ring-4 focus:ring-red-100 transition-all font-medium bg-white text-sm"
                    placeholder="Nama lengkap" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1.5 text-slate-500 tracking-widest uppercase">Username / Email *</label>
                  <input value={registerForm.username} onChange={e => setRegisterForm({ ...registerForm, username: e.target.value })}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 focus:border-red-500 focus:ring-4 focus:ring-red-100 transition-all font-medium bg-white text-sm"
                    placeholder="Username atau email" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1.5 text-slate-500 tracking-widest uppercase">Password *</label>
                  <input type="password" value={registerForm.password} onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 focus:border-red-500 focus:ring-4 focus:ring-red-100 transition-all font-medium bg-white text-sm"
                    placeholder="Password" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1.5 text-slate-500 tracking-widest uppercase">Role *</label>
                  <select value={registerForm.role} onChange={e => setRegisterForm({ ...registerForm, role: e.target.value })}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 focus:border-red-500 focus:ring-4 focus:ring-red-100 transition-all font-medium bg-white text-sm">
                    <option value="team">Team — Akses Reminder &amp; Troubleshooting</option>
                    <option value="guest">Guest — Akses Ticketing saja</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1 px-1">
                    {registerForm.role === 'guest' ? '👤 Guest hanya dapat melihat dan submit ticket troubleshooting.' : '👷 Team mendapatkan akses penuh ke Reminder Schedule dan Ticket Troubleshooting.'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1.5 text-slate-500 tracking-widest uppercase">No. HP</label>
                  <input value={registerForm.phone_number} onChange={e => setRegisterForm({ ...registerForm, phone_number: e.target.value })}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 focus:border-red-500 focus:ring-4 focus:ring-red-100 transition-all font-medium bg-white text-sm"
                    placeholder="08xx-xxxx-xxxx (opsional)" />
                </div>
                <button onClick={handleRegister} disabled={registerLoading}
                  className="w-full text-white py-3.5 rounded-xl font-bold shadow-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-sm mt-2"
                  style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                  {registerLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Mendaftar...</> : '📝 Daftar Akun'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // ── GUEST LAYOUT — full ticketing, no sidebar ──────────────────────────────
  if (currentUser?.role === 'guest') {
    return (
      <div className="flex flex-col h-screen overflow-hidden"
        style={{ backgroundImage: 'url(/IVP_Background.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(255,255,255,0.04)' }} />
        {showSettings && <AccountSettingsModal onClose={() => setShowSettings(false)} />}

        {/* Header — guest */}
        <header className="relative z-50 flex-shrink-0 bg-white/90 backdrop-blur-md shadow-md" style={{ borderBottom: '2.5px solid #dc2626' }}>
          <div className="w-full px-5 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/logo-servisindo.png" alt="Servisindo" style={{ height: '34px', width: 'auto', objectFit: 'contain' }} />
              <div className="hidden md:block border-l border-slate-200 pl-3">
                <p className="text-[10px] font-bold tracking-widest uppercase text-red-600 leading-none">Ticket Troubleshooting</p>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">Multimedia Service Center</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Bell only for ticketing */}
              <NotifBell items={notifs.filter(n => n.type === 'ticket')} onTicketClick={() => {}} onReminderClick={() => {}} />
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white/80">
                <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                  {currentUser?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
                </div>
                <span className="text-[9px] font-bold tracking-widest uppercase text-red-600 hidden sm:inline">Guest</span>
              </div>
              <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all" style={{ background: 'rgba(100,116,139,0.07)', border: '1px solid rgba(100,116,139,0.2)', color: '#475569' }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </header>

        {/* Full ticketing iframe */}
        <div className="relative z-10 flex-1 overflow-hidden">
          <iframe key={iframeKey} src="/ticketing-services" className="w-full h-full border-0" title="Ticket Troubleshooting" />
        </div>

        {/* Footer — full width, front of layer */}
        <div className="relative z-50 flex-shrink-0 bg-white border-t border-slate-200">
          <p className="text-slate-400 text-xs font-medium text-center py-3 tracking-wide">
            © 2026 Servisindo Multimedia Service Center — Work Management Support System
          </p>
        </div>
      </div>
    );
  }

  // ── TEAM / ADMIN LAYOUT — sidebar + 2 menus ─────────────────────────────────
  const menuItems = [
    { key: 'ticketing' as const, label: 'Ticket Troubleshooting', icon: (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>), iframeUrl: '/ticketing-services', accent: '#dc2626', bg: 'rgba(220,38,38,0.09)', border: 'rgba(220,38,38,0.28)' },
    { key: 'reminder' as const, label: 'Reminder Schedule', icon: (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>), iframeUrl: '/reminder-services', accent: '#b45309', bg: 'rgba(180,83,9,0.09)', border: 'rgba(180,83,9,0.28)' },
  ];

  const activeItem = menuItems.find(m => m.key === activeMenu)!;
  const ticketNotifCount = notifs.filter(n => n.type === 'ticket').length;
  const reminderNotifCount = notifs.filter(n => n.type === 'reminder').length;
  const pendingApprovals = 0; // fetched in AccountSettingsModal

  return (
    <div className="flex flex-col h-screen overflow-hidden"
      style={{ backgroundImage: 'url(/IVP_Background.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(255,255,255,0.04)' }} />
      {showSettings && <AccountSettingsModal onClose={() => setShowSettings(false)} />}

      {/* ── HEADER ── */}
      <header className="relative z-50 flex-shrink-0 bg-white/90 backdrop-blur-md shadow-md" style={{ borderBottom: '2.5px solid #dc2626' }}>
        <div className="w-full px-4 py-3 flex items-center justify-between gap-4">
          {/* Logo + brand */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <img src="/logo-servisindo.png" alt="Servisindo" style={{ height: '34px', width: 'auto', objectFit: 'contain' }} />
            <div className="hidden md:block border-l border-slate-200 pl-3">
              <p className="text-[10px] font-bold tracking-widest uppercase text-red-600 leading-none">Work Management</p>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">Multimedia Service Center</p>
            </div>
          </div>

          <div className="flex-1" />

          {/* RIGHT: Bell (only visible on ticketing page) + user + buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Bell only shows when on ticketing menu */}
            {activeMenu === 'ticketing' && (
              <NotifBell items={notifs} onTicketClick={() => handleNavClick('ticketing')} onReminderClick={() => handleNavClick('reminder')} />
            )}

            {/* User info — no name, just avatar + role badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white/80">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                {currentUser?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
              </div>
              {/* Name hidden — shown in Dashboard only */}
              <p className="text-[9px] font-bold tracking-widest uppercase text-red-600 hidden sm:inline">{currentUser?.role}</p>
            </div>

            {currentUser?.role === 'admin' && (
              <button onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all relative"
                style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.22)', color: '#b91c1c' }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}

            <button onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{ background: 'rgba(100,116,139,0.07)', border: '1px solid rgba(100,116,139,0.2)', color: '#475569' }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── BODY: SIDEBAR + IFRAME ── */}
      <div className="relative z-10 flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <aside className={`relative flex flex-col flex-shrink-0 transition-all duration-300 ${sidebarCollapsed ? 'w-[68px]' : 'w-[236px]'}`}
          style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', boxShadow: '3px 0 18px rgba(0,0,0,0.07)', borderRight: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg,transparent,#dc2626,transparent)' }} />

          {/* Sidebar header */}
          <div className={`flex items-center border-b px-3 py-4 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`} style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                </div>
                <div>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-red-600 leading-none">Servisindo</p>
                  <p className="font-bold text-sm text-slate-800 leading-tight">SVC Portal</p>
                </div>
              </div>
            )}
            {sidebarCollapsed && (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
            )}
            {!sidebarCollapsed && (
              <button onClick={() => setSidebarCollapsed(true)} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" /></svg>
              </button>
            )}
          </div>

          {/* User info in sidebar when expanded */}
          {!sidebarCollapsed && currentUser && (
            <div className="px-3 py-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                  {currentUser.full_name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{currentUser.full_name}</p>
                  <p className="text-[9px] font-bold tracking-widest uppercase text-red-600">{currentUser.role}</p>
                </div>
              </div>
            </div>
          )}

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" style={{ scrollbarWidth: 'none' }}>
            {!sidebarCollapsed && <p className="px-1 mb-3 text-[10px] font-bold tracking-widest uppercase text-slate-400">Menu Utama</p>}
            {menuItems.map(item => {
              const isActive = activeMenu === item.key;
              const notifCount = item.key === 'ticketing' ? ticketNotifCount : reminderNotifCount;
              return (
                <div key={item.key} className="group relative">
                  <button onClick={() => handleNavClick(item.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all ${sidebarCollapsed ? 'justify-center' : ''}`}
                    style={isActive
                      ? { background: item.bg, border: `1px solid ${item.border}`, color: item.accent }
                      : { background: 'transparent', border: '1px solid transparent', color: '#334155' }}>
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: isActive ? `${item.accent}18` : 'rgba(0,0,0,0.06)', color: isActive ? item.accent : '#64748b' }}>
                      {item.icon}
                    </span>
                    {!sidebarCollapsed && (
                      <>
                        <span className="flex-1 text-left truncate tracking-wide">{item.label}</span>
                        {notifCount > 0 && <span className="min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-[10px] font-black text-white" style={{ background: item.accent }}>{notifCount > 9 ? '9+' : notifCount}</span>}
                        {isActive && notifCount === 0 && <div className="w-1.5 h-1.5 rounded-full" style={{ background: item.accent }} />}
                      </>
                    )}
                    {sidebarCollapsed && notifCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ background: item.accent }}>{notifCount}</span>
                    )}
                  </button>
                  {sidebarCollapsed && (
                    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      <div className="rounded-xl px-3 py-2 shadow-lg" style={{ background: '#f8fafc', border: `1px solid ${item.border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                        <p className="text-xs font-bold" style={{ color: item.accent }}>{item.label}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Expand button when collapsed */}
          <div className="p-3" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
            {sidebarCollapsed ? (
              <button onClick={() => setSidebarCollapsed(false)} className="w-full flex justify-center p-2 rounded-xl text-slate-400 hover:text-slate-600 transition-all" style={{ background: 'rgba(0,0,0,0.04)' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M6 5l7 7-7 7" /></svg>
              </button>
            ) : (
              <div className="text-center"><p className="text-[10px] text-slate-300 font-medium">© 2026 Servisindo</p></div>
            )}
          </div>
        </aside>

        {/* MAIN: iframe */}
        <main className="flex-1 overflow-hidden">
          <iframe key={iframeKey} src={activeItem.iframeUrl} className="w-full h-full border-0" title={activeItem.label} />
        </main>
      </div>

      {/* ── FOOTER — full width, z-50 (front of layer, mentok kiri) ── */}
      <div className="relative z-50 flex-shrink-0 bg-white border-t border-slate-200" style={{ marginLeft: 0 }}>
        <p className="text-slate-400 text-xs font-medium text-center py-3 tracking-wide">
          © 2026 Servisindo Multimedia Service Center — Work Management Support System
        </p>
      </div>
    </div>
  );
}
