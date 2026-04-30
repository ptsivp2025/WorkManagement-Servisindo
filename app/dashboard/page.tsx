'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// ── Supabase clients — lazy init ─────────────────────────────────────────────
let _supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('SUPABASE env not set');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

interface User {
  id: string; username: string; password: string;
  full_name: string; role: string; phone_number?: string;
  approved?: boolean;
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
    if (error) {
      if (error.message.includes('role_check') || error.message.includes('check constraint')) {
        notify('error', `Role "${editingUser.role}" tidak diizinkan DB. Coba nilai lain.`);
      } else {
        notify('error', 'Gagal: ' + error.message);
      }
      return;
    }
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
                  <option value="guest">Guest</option>
                  <option value="team">Team</option>
                  <option value="admin">Admin</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Guest = Ticketing saja · Team = Akses penuh · Admin = Full + Settings</p>
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

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function ServicesDashboard() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeMenu, setActiveMenu] = useState<'ticketing' | 'reminder'>('ticketing');
  const [iframeKey, setIframeKey] = useState(0);

  // Register form
  const [showRegister, setShowRegister] = useState(false);
  const [registerForm, setRegisterForm] = useState({ full_name: '', username: '', password: '', phone_number: '', sales_division: '' });
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
    const { full_name, username, password, phone_number, sales_division } = registerForm;
    if (!full_name.trim() || !username.trim() || !password.trim()) { setRegisterError('Nama, username, dan password wajib diisi!'); return; }
    setRegisterLoading(true); setRegisterError('');
    try {
      const supabase = getSupabase();
      const { data: existing } = await supabase.from('users').select('id').eq('username', username.trim()).maybeSingle();
      if (existing) { setRegisterError('Username sudah digunakan!'); setRegisterLoading(false); return; }
      const { error } = await supabase.from('users').insert([{
        full_name: full_name.trim(), username: username.trim(), password,
        role: 'guest', phone_number: phone_number.trim() || null, approved: false,
        sales_division: sales_division || null,
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
              <button onClick={() => { setShowRegister(false); setRegisterSuccess(false); setRegisterForm({ full_name: '', username: '', password: '', phone_number: '', sales_division: '' }); }}
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
                  <label className="block text-xs font-bold mb-1.5 text-slate-500 tracking-widest uppercase">Sales Division</label>
                  <select value={registerForm.sales_division} onChange={e => setRegisterForm({ ...registerForm, sales_division: e.target.value })}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 focus:border-red-500 focus:ring-4 focus:ring-red-100 transition-all font-medium bg-white text-sm">
                    <option value="">— Pilih Sales Division —</option>
                    {['IVP','MLDS','HAVS','Enterprise','DEC','ICS','POJ','VOJ','LOCOS','VISIONMEDIA','UMP','BISOL','KIMS','IDC','IOCMEDAN','IOCPekanbaru','IOCBandung','IOCJATENG','MVISEMARANG','POSSurabaya','IOCSurabaya','IOCBali','SGP','OSS'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1.5 text-slate-500 tracking-widest uppercase">No. HP</label>
                  <input value={registerForm.phone_number} onChange={e => setRegisterForm({ ...registerForm, phone_number: e.target.value })}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 focus:border-red-500 focus:ring-4 focus:ring-red-100 transition-all font-medium bg-white text-sm"
                    placeholder="08xx-xxxx-xxxx (opsional)" />
                </div>
                <div className="px-3 py-2.5 rounded-xl text-xs text-slate-500 border border-slate-200 bg-slate-50">
                  ℹ️ Role akses akan diatur oleh Admin setelah akun disetujui.
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

  // ── TEAM / ADMIN LAYOUT — header nav (no sidebar) ────────────────────────────
  const menuItems = [
    { key: 'ticketing' as const, label: 'Ticket Troubleshooting', icon: (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>), iframeUrl: '/ticketing-services', accent: '#dc2626', bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.35)' },
    { key: 'reminder' as const, label: 'Reminder Schedule', icon: (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>), iframeUrl: '/reminder-services', accent: '#b45309', bg: 'rgba(180,83,9,0.10)', border: 'rgba(180,83,9,0.35)' },
  ];

  const activeItem = menuItems.find(m => m.key === activeMenu)!;

  return (
    <div className="flex flex-col h-screen overflow-hidden"
      style={{ backgroundImage: 'url(/IVP_Background.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(255,255,255,0.04)' }} />
      {showSettings && <AccountSettingsModal onClose={() => setShowSettings(false)} />}

      {/* ── HEADER ── */}
      <header className="relative z-50 flex-shrink-0 bg-white/95 backdrop-blur-md shadow-md" style={{ borderBottom: '2.5px solid #dc2626' }}>
        <div className="w-full px-5 py-0 flex items-center gap-4" style={{ minHeight: 58 }}>
          {/* Logo + Brand */}
          <div className="flex items-center gap-3 flex-shrink-0 py-2">
            <img src="/logo-servisindo.png" alt="Servisindo" style={{ height: '42px', width: 'auto', objectFit: 'contain' }} />
            <div className="hidden md:block border-l border-slate-200 pl-3">
              <p className="text-base font-black tracking-tight text-slate-800 leading-tight">Work Management</p>
              <p className="text-xs font-bold text-red-600 tracking-widest uppercase leading-none">Multimedia Service Center</p>
            </div>
          </div>

          <nav className="flex items-center gap-1 flex-1 justify-center">
            {menuItems.map(item => {
              const isActive = activeMenu === item.key;
              return (
                <button key={item.key} onClick={() => handleNavClick(item.key)}
                  className="relative flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all"
                  style={isActive
                    ? { background: item.bg, border: `1.5px solid ${item.border}`, color: item.accent }
                    : { background: 'transparent', border: '1.5px solid transparent', color: '#475569' }}>
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: isActive ? `${item.accent}18` : 'rgba(0,0,0,0.05)', color: isActive ? item.accent : '#64748b' }}>
                    {item.icon}
                  </span>
                  <span className="tracking-wide">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* RIGHT: user + settings + logout */}
          <div className="flex items-center gap-2 flex-shrink-0 py-2">

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white/80">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                {currentUser?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
              </div>
              <span className="text-sm font-semibold text-slate-700 hidden sm:inline">{currentUser?.full_name}</span>
              <span className="text-[9px] font-bold tracking-widest uppercase text-red-600 hidden sm:inline">{currentUser?.role}</span>
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

      {/* ── BODY: IFRAME only (no sidebar) ── */}
      <main className="relative z-10 flex-1 overflow-hidden">
        <iframe key={iframeKey} src={activeItem.iframeUrl} className="w-full h-full border-0" title={activeItem.label} />
      </main>

      {/* ── FOOTER ── */}
      <div className="relative z-50 flex-shrink-0 bg-white border-t border-slate-200">
        <p className="text-slate-400 text-xs font-medium text-center py-3 tracking-wide">
          © 2026 Servisindo Multimedia Service Center — Work Management Support System
        </p>
      </div>
    </div>
  );
}
