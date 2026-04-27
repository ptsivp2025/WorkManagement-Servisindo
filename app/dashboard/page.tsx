'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface User {
  id: string;
  username: string;
  password: string;
  full_name: string;
  role: string;
  team_type?: string;
  sales_division?: string;
  allowed_menus?: string[];
}

interface MenuItem {
  title: string;
  icon: string;
  gradient: string;
  description: string;
  key: string;
  items: {
    name: string;
    url: string;
    icon: string;
    external?: boolean;
    embed?: boolean;
    internal?: boolean;
  }[];
}

// ─── Notification Types ───────────────────────────────────────────────────────

interface NotificationItem {
  id: string;
  type: 'ticket' | 'require' | 'reminder';
  title: string;
  subtitle: string;
  time: string;
  url: string;
  internalUrl?: string;
  menuTitle: string;
}

const SALES_DIVISIONS = [
  'IVP', 'MLDS', 'HAVS', 'Enterprise', 'DEC', 'ICS', 'POJ', 'VOJ', 'LOCOS',
  'VISIONMEDIA', 'UMP', 'BISOL', 'KIMS', 'IDC', 'IOCMEDAN', 'IOCPekanbaru',
  'IOCBandung', 'IOCJATENG', 'MVISEMARANG', 'POSSurabaya', 'IOCSurabaya',
  'IOCBali', 'SGP', 'OSS',
];

// ─── Account Settings Modal ──────────────────────────────────────────────────

const ALL_MENU_KEYS = [
  'form-bast',
  'form-require-project',
  'ticket-troubleshooting',
  'daily-report',
  'database-pts',
  'unit-movement',
  'reminder-schedule',
];

interface AccountSettingsModalProps {
  onClose: () => void;
}

function AccountSettingsModal({ onClose }: AccountSettingsModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'guest',
    team_type: '',
    sales_division: '',
    allowed_menus: ALL_MENU_KEYS,
  });
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const menuLabels: Record<string, { label: string; icon: string; gradient: string }> = {
    'form-bast': { label: 'Form Review Demo & BAST', icon: '⭐', gradient: 'from-slate-600 to-slate-500' },
    'form-require-project': { label: 'Form Require Project', icon: '🏗️', gradient: 'from-violet-600 to-violet-500' },
    'ticket-troubleshooting': { label: 'Ticket Troubleshooting', icon: '🎫', gradient: 'from-rose-600 to-rose-500' },
    'daily-report': { label: 'Daily Report', icon: '📈', gradient: 'from-emerald-600 to-emerald-500' },
    'database-pts': { label: 'Database PTS', icon: '💼', gradient: 'from-indigo-600 to-indigo-500' },
    'unit-movement': { label: 'Unit Movement Log', icon: '🚚', gradient: 'from-amber-600 to-amber-500' },
    'reminder-schedule': { label: 'Reminder Schedule', icon: '🗓️', gradient: 'from-cyan-600 to-cyan-500' },
  };

  const notify = (type: 'success' | 'error', msg: string) => {
    setNotification({ type, msg });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    const { data, error } = await supabase.from('users').select('*').order('full_name');
    if (!error && data) setUsers(data);
    setLoadingUsers(false);
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password || !newUser.full_name) {
      notify('error', 'Semua field wajib diisi!'); return;
    }
    if (newUser.role === 'guest' && !newUser.sales_division) {
      notify('error', 'Sales Division wajib diisi untuk role Guest!'); return;
    }
    setSaving(true);
    // Build insert payload — avoid null for columns that might have NOT NULL constraint
    const insertPayload: Record<string, unknown> = {
      username: newUser.username,
      password: newUser.password,
      full_name: newUser.full_name,
      role: newUser.role,
      allowed_menus: newUser.allowed_menus,
    };
    // team_type: only for team role
    if (newUser.role === 'team') insertPayload.team_type = newUser.team_type || null;
    // sales_division: for guest and sales roles
    if (newUser.role === 'guest' || newUser.role === 'sales') {
      insertPayload.sales_division = newUser.sales_division || null;
    }
    const { error } = await supabase.from('users').insert([insertPayload]);
    setSaving(false);
    if (error) { notify('error', 'Gagal menambah akun: ' + error.message); return; }
    notify('success', 'Akun berhasil ditambahkan!');
    setNewUser({ username: '', password: '', full_name: '', role: 'guest', team_type: '', sales_division: '', allowed_menus: ALL_MENU_KEYS });
    setActiveTab('list');
    fetchUsers();
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setSaving(true);
    const updatePayload: Record<string, unknown> = {
      username: editingUser.username,
      password: editingUser.password,
      full_name: editingUser.full_name,
      role: editingUser.role,
      allowed_menus: editingUser.allowed_menus ?? ALL_MENU_KEYS,
    };
    if (editingUser.role === 'team') updatePayload.team_type = editingUser.team_type ?? null;
    else if (editingUser.team_type === 'Pending Approval') {
      // Admin meng-approve: hapus team_type 'Pending Approval', set ke null atau Guest
      updatePayload.team_type = null;
      updatePayload.sales_division = editingUser.sales_division ?? null;
    }
    if (editingUser.role === 'guest' || editingUser.role === 'sales') {
      updatePayload.sales_division = editingUser.sales_division ?? null;
    }
    // For Pending Approval users being approved — clear team_type and set proper role
    // (handled by admin selecting role in edit form)
    const { error } = await supabase.from('users').update(updatePayload).eq('id', editingUser.id);
    setSaving(false);
    if (error) { notify('error', 'Gagal menyimpan: ' + error.message); return; }
    notify('success', 'Akun berhasil diperbarui!');
    setEditingUser(null);
    fetchUsers();
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Hapus akun ini?')) return;
    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (error) { notify('error', 'Gagal menghapus akun.'); return; }
    notify('success', 'Akun dihapus.');
    fetchUsers();
  };

  const toggleMenu = (key: string, target: 'new' | 'edit') => {
    if (target === 'new') {
      setNewUser(prev => ({
        ...prev,
        allowed_menus: prev.allowed_menus.includes(key)
          ? prev.allowed_menus.filter(m => m !== key)
          : [...prev.allowed_menus, key],
      }));
    } else if (editingUser) {
      const current = editingUser.allowed_menus ?? ALL_MENU_KEYS;
      setEditingUser({
        ...editingUser,
        allowed_menus: current.includes(key)
          ? current.filter(m => m !== key)
          : [...current, key],
      });
    }
  };

  const MenuPermissionSelector = ({ selected, target }: { selected: string[]; target: 'new' | 'edit' }) => (
    <div>
      <label className="block text-xs font-bold mb-2 text-slate-600 tracking-widest uppercase">Menu yang Dapat Diakses</label>
      <div className="grid grid-cols-1 gap-2">
        {ALL_MENU_KEYS.map(key => {
          const m = menuLabels[key];
          const checked = selected.includes(key);
          return (
            <button key={key} type="button" onClick={() => toggleMenu(key, target)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all text-left ${checked ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'}`}>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${checked ? 'border-rose-500 bg-rose-500' : 'border-slate-300 bg-white'}`}>
                {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </div>
              <span className="text-lg">{m.icon}</span>
              <span className="font-semibold text-sm">{m.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Account Settings</h2>
              <p className="text-white/60 text-xs">Kelola akun & hak akses menu</p>
            </div>
          </div>
          <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {notification && (
          <div className={`mx-6 mt-4 px-4 py-3 rounded-lg text-sm font-semibold flex items-center gap-2 ${notification.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {notification.type === 'success' ? '✅' : '❌'} {notification.msg}
          </div>
        )}

        <div className="flex border-b border-slate-200 px-6 pt-4 flex-shrink-0">
          <button onClick={() => { setActiveTab('list'); setEditingUser(null); }}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${activeTab === 'list' ? 'border-rose-500 text-rose-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            👥 Daftar Akun
          </button>
          <button onClick={() => { setActiveTab('add'); setEditingUser(null); }}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${activeTab === 'add' ? 'border-rose-500 text-rose-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            ➕ Tambah Akun
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'list' && (
            <div className="space-y-4">
              {loadingUsers ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-10 h-10 border-4 border-slate-200 border-t-rose-500 rounded-full animate-spin"></div>
                </div>
              ) : editingUser ? (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-2">
                    <button onClick={() => setEditingUser(null)} className="text-slate-500 hover:text-slate-700 p-1">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <h3 className="font-bold text-slate-800">Edit: {editingUser.full_name}</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Full Name</label>
                      <input value={editingUser.full_name} onChange={e => setEditingUser({ ...editingUser, full_name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Username</label>
                      <input value={editingUser.username} onChange={e => setEditingUser({ ...editingUser, username: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Password</label>
                      <input value={editingUser.password} onChange={e => setEditingUser({ ...editingUser, password: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Role</label>
                      <select value={editingUser.role} onChange={e => setEditingUser({ ...editingUser, role: e.target.value, team_type: '', sales_division: '' })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none bg-white">
                        {editingUser.team_type === 'Pending Approval' && <option value="guest" disabled>⏳ Pending Approval — pilih role di bawah</option>}
                        <option value="guest">Guest</option>
                        <option value="team">Team</option>
                        <option value="sales">Sales</option>
                        <option value="admin">Admin</option>
                        <option value="superadmin">Superadmin</option>
                      </select>
                    </div>
                  </div>
                  {editingUser.role === 'team' && (
                    <div>
                      <label className="block text-xs font-bold mb-2 text-slate-600 tracking-widest uppercase">Team Type</label>
                      <div className="flex gap-3">
                        {['Team PTS', 'Team Services'].map(t => (
                          <button key={t} type="button"
                            onClick={() => setEditingUser({ ...editingUser, team_type: t })}
                            className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${editingUser.team_type === t ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'}`}>
                            {t === 'Team PTS' ? '👥' : '👥'} {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {editingUser.role === 'guest' && (
                    <div>
                      <label className="block text-xs font-bold mb-2 text-slate-600 tracking-widest uppercase">Sales Division *</label>
                      <select
                        value={editingUser.sales_division ?? ''}
                        onChange={e => setEditingUser({ ...editingUser, sales_division: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none bg-white"
                      >
                        <option value="">-- Pilih Divisi --</option>
                        {SALES_DIVISIONS.map(div => (
                          <option key={div} value={div}>{div}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <MenuPermissionSelector selected={editingUser.allowed_menus ?? ALL_MENU_KEYS} target="edit" />
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setEditingUser(null)} className="flex-1 border border-slate-300 text-slate-700 py-3 rounded-lg font-semibold hover:bg-slate-50 transition-all text-sm">Batal</button>
                    <button onClick={handleSaveEdit} disabled={saving}
                      className="flex-1 bg-gradient-to-r from-rose-600 to-rose-700 text-white py-3 rounded-lg font-semibold hover:from-rose-700 hover:to-rose-800 transition-all text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                      {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                      Simpan Perubahan
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Search bar */}
                  <div className="relative mb-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Cari nama, username, atau role..."
                      className="w-full pl-9 pr-9 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none bg-white"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-medium mb-1">
                    {users.filter(u =>
                      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      u.role?.toLowerCase().includes(searchQuery.toLowerCase())
                    ).length} akun ditemukan
                  </p>
                  {/* Pending users section */}
                  {users.filter(u => u.team_type === 'Pending Approval' && (
                    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (searchQuery === '' || 'pending'.includes(searchQuery.toLowerCase()))
                  )).length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">⏳ Menunggu Persetujuan</span>
                        <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                          {users.filter(u => u.team_type === 'Pending Approval').length}
                        </span>
                      </div>
                      {users.filter(u => u.team_type === 'Pending Approval' && (
                        !searchQuery ||
                        u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        u.username?.toLowerCase().includes(searchQuery.toLowerCase())
                      )).map(user => (
                        <div key={user.id} className="rounded-xl p-4 mb-2 border-2 border-amber-300" style={{ background: 'rgba(254,243,199,0.7)' }}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm bg-amber-200 text-amber-800">
                                {user.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-800 text-sm">{user.full_name}</p>
                                <p className="text-xs text-slate-500">@{user.username}</p>
                                {user.sales_division && <p className="text-xs text-amber-700 font-semibold mt-0.5">🏢 {user.sales_division}</p>}
                              </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <button onClick={() => setEditingUser({ ...user, role: 'guest' })}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 transition-all shadow-sm">
                                ✅ Approve & Set Role
                              </button>
                              <button onClick={() => handleDeleteUser(user.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-all">
                                Tolak
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Active users list */}
                  {users
                    .filter(u => u.team_type !== 'Pending Approval' && (
                      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      u.role?.toLowerCase().includes(searchQuery.toLowerCase())
                    ))
                    .map(user => (
                    <div key={user.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm"
                            style={{ background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)', color: '#c8861d', border: '2px solid rgba(200,134,29,0.3)' }}>
                            {user.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 text-sm truncate">{user.full_name}</p>
                            <p className="text-xs text-slate-500">@{user.username}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase bg-slate-200 text-slate-600">{user.role}</span>
                              {user.team_type && (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase bg-rose-100 text-rose-600 border border-rose-200">
                                  👥 {user.team_type}
                                </span>
                              )}
                              {user.sales_division && (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase bg-violet-100 text-violet-600 border border-violet-200">
                                  🏢 {user.sales_division}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => setEditingUser(user)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-all">Edit</button>
                          <button onClick={() => handleDeleteUser(user.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-all">Hapus</button>
                        </div>
                      </div>
                      {user.allowed_menus && user.allowed_menus.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {user.allowed_menus.map(key => (
                            <span key={key} className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border border-slate-200 text-slate-600">
                              {menuLabels[key]?.icon} {menuLabels[key]?.label ?? key}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {searchQuery && users.filter(u =>
                    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    u.role?.toLowerCase().includes(searchQuery.toLowerCase())
                  ).length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm">
                      <div className="text-3xl mb-2">🔍</div>
                      Tidak ada akun yang cocok dengan &ldquo;{searchQuery}&rdquo;
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'add' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Full Name *</label>
                  <input value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none" placeholder="Nama lengkap" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Username *</label>
                  <input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none" placeholder="username" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Password *</label>
                  <input value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none" placeholder="password" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Role</label>
                  <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value, team_type: '', sales_division: '' })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none bg-white">
                    <option value="guest">Guest</option>
                    <option value="team">Team</option>
                    <option value="sales">Sales</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </div>
              </div>
              {newUser.role === 'team' && (
                <div>
                  <label className="block text-xs font-bold mb-2 text-slate-600 tracking-widest uppercase">Team Type</label>
                  <div className="flex gap-3">
                    {['Team PTS', 'Team Services'].map(t => (
                      <button key={t} type="button"
                        onClick={() => setNewUser({ ...newUser, team_type: t })}
                        className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${newUser.team_type === t ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'}`}>
                        {t === 'Team PTS' ? '🏗️' : '🔧'} {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(newUser.role === 'guest' || newUser.role === 'sales') && (
                <div>
                  <label className="block text-xs font-bold mb-2 text-slate-600 tracking-widest uppercase">Sales Division {newUser.role === 'guest' ? '*' : ''}</label>
                  <select
                    value={newUser.sales_division}
                    onChange={e => setNewUser({ ...newUser, sales_division: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none bg-white"
                  >
                    <option value="">-- Pilih Divisi --</option>
                    {SALES_DIVISIONS.map(div => (
                      <option key={div} value={div}>{div}</option>
                    ))}
                  </select>
                </div>
              )}
              <MenuPermissionSelector selected={newUser.allowed_menus} target="new" />
              <button onClick={handleAddUser} disabled={saving}
                className="w-full bg-gradient-to-r from-rose-600 to-rose-700 text-white py-3 rounded-lg font-semibold hover:from-rose-700 hover:to-rose-800 transition-all text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                ➕ Tambah Akun
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Notification Bell Component ─────────────────────────────────────────────

interface NotifBellProps {
  icon: string;
  label: string;
  count: number;
  color: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
  items: NotificationItem[];
  onItemClick: (item: NotificationItem) => void;
}

function NotifBell({ icon, label, count, color, bgColor, borderColor, dotColor, items, onItemClick }: NotifBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const formatTime = (ts: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins}m lalu`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}j lalu`;
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          background: count > 0 ? bgColor : 'rgba(255,255,255,0.55)',
          border: `1.5px solid ${count > 0 ? borderColor : 'rgba(0,0,0,0.1)'}`,
          boxShadow: count > 0 ? `0 2px 12px ${borderColor}55` : 'none',
        }}
      >
        <span className="text-base leading-none">{icon}</span>
        <span className="text-xs font-bold hidden sm:block" style={{ color: count > 0 ? color : '#64748b' }}>{label}</span>
        {count > 0 && (
          <span
            className="flex items-center justify-center rounded-full text-white font-black text-[10px] min-w-[18px] h-[18px] px-1 animate-pulse"
            style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}88` }}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
        {count === 0 && (
          <span className="text-[10px] font-semibold text-slate-400">0</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-full mt-2 right-0 z-[9999] rounded-2xl shadow-2xl overflow-hidden"
          style={{
            width: 320,
            background: 'rgba(255,255,255,0.97)',
            border: `1.5px solid ${borderColor}`,
            backdropFilter: 'blur(16px)',
            boxShadow: `0 8px 40px rgba(0,0,0,0.18), 0 0 0 1px ${borderColor}33`,
            animation: 'dropIn 0.18s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: bgColor, borderBottom: `1px solid ${borderColor}44` }}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{icon}</span>
              <span className="text-sm font-bold" style={{ color }}>{label}</span>
            </div>
            {count > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black text-white" style={{ background: dotColor }}>
                {count} baru
              </span>
            )}
          </div>

          {/* Items */}
          <div className="max-h-72 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <span className="text-3xl opacity-40">✅</span>
                <p className="text-xs text-slate-400 font-medium">Tidak ada notifikasi</p>
              </div>
            ) : (
              items.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => { onItemClick(item); setOpen(false); }}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors border-b border-slate-100/80 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{item.title}</p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{item.subtitle}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5">{formatTime(item.time)}</span>
                </button>
              ))
            )}
          </div>

          {items.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100">
              <p className="text-[10px] text-center text-slate-400 font-medium">Klik item untuk membuka</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Notification Bar Component ───────────────────────────────────────────────

interface NotificationBarProps {
  currentUser: User;
  onNavigate: (internalUrl: string, title: string) => void;
}

function NotificationBar({ currentUser, onNavigate }: NotificationBarProps) {
  const [ticketNotifs, setTicketNotifs]   = useState<NotificationItem[]>([]);
  const [requireNotifs, setRequireNotifs] = useState<NotificationItem[]>([]);
  const [reminderNotifs, setReminderNotifs] = useState<NotificationItem[]>([]);
  const [reviewNotifs, setReviewNotifs]   = useState<NotificationItem[]>([]);

  const roleLC = (currentUser.role ?? '').trim().toLowerCase();
  const teamType = (currentUser.team_type ?? '').trim();
  const isTeamServices = roleLC === 'team' && teamType === 'Team Services';
  const isTeamPTS = roleLC === 'team' && teamType === 'Team PTS';
  const isPTS  = ['admin', 'superadmin'].includes(roleLC) || isTeamPTS;
  const isAdmin = ['admin', 'superadmin'].includes(roleLC);
  const isGuest = roleLC === 'guest';

  const fetchAll = useCallback(async () => {
    // ── Fetch member info dari team_members — source of truth untuk nama & team type
    let assignedName: string = currentUser.full_name;
    let memberTeamType: string = teamType;
    try {
      // Coba match username case-insensitive
      const { data: allMembers } = await supabase
        .from('team_members')
        .select('name, team_type, username');
      if (allMembers && allMembers.length > 0) {
        const found = (allMembers as any[]).find(m =>
          (m.username ?? '').toLowerCase().trim() === currentUser.username.toLowerCase().trim()
        );
        if (found?.name) assignedName = found.name;
        if (found?.team_type) memberTeamType = found.team_type;
      }
    } catch { /* pakai fallback */ }
    console.log('[notif] user:', currentUser.username, '| role:', roleLC, '| assignedName:', assignedName, '| memberTeamType:', memberTeamType);

    // ── 1. Ticket Troubleshooting ──
    try {
      if (isAdmin) {
        // Admin/Superadmin: SEMUA ticket belum Solved
        const { data } = await supabase
          .from('tickets')
          .select('id, project_name, issue_case, assign_name, status, created_at')
          .neq('status', 'Solved')
          .order('created_at', { ascending: false })
          .limit(50);
        console.log('[notif] admin tickets:', data?.length ?? 0);
        setTicketNotifs((data ?? []).map((t: any) => ({
          id: t.id, type: 'ticket' as const,
          title: t.project_name,
          subtitle: `${t.status} · ${t.issue_case}`,
          time: t.created_at,
          url: '/ticketing', internalUrl: '/ticketing',
          menuTitle: 'Ticket Troubleshooting',
        })));
      } else if (roleLC === 'guest') {
        // Guest: ticket yang dibuat sendiri atau di-mapping admin
        const { data: mappings } = await supabase
          .from('guest_mappings').select('project_name')
          .eq('guest_username', currentUser.username);
        const mapped = (mappings ?? []).map((m: any) => m.project_name as string);
        let q = supabase
          .from('tickets')
          .select('id, project_name, issue_case, assign_name, status, created_at')
          .neq('status', 'Solved');
        if (mapped.length > 0) {
          q = q.or(`created_by.eq.${currentUser.username},project_name.in.(${mapped.map((p: string) => `"${p}"`).join(',')})`);
        } else {
          q = q.eq('created_by', currentUser.username);
        }
        const { data } = await q.order('created_at', { ascending: false }).limit(30);
        setTicketNotifs((data ?? []).map((t: any) => ({
          id: t.id, type: 'ticket' as const,
          title: t.project_name,
          subtitle: `${t.status} · ${t.issue_case}`,
          time: t.created_at,
          url: '/ticketing', internalUrl: '/ticketing',
          menuTitle: 'Ticket Troubleshooting',
        })));
      } else if (roleLC === 'team' || roleLC === 'team_pts') {
        // Team (PTS atau Services) — pakai assignedName dari team_members
        // Sama persis dengan getNotifications() di ticketing
        if (memberTeamType === 'Team Services') {
          // Team Services: ticket assigned ke mereka, services_status belum Solved
          const { data } = await supabase
            .from('tickets')
            .select('id, project_name, issue_case, assign_name, status, services_status, created_at')
            .eq('assign_name', assignedName)
            .neq('services_status', 'Solved')
            .not('services_status', 'is', null)
            .order('created_at', { ascending: false })
            .limit(30);
          setTicketNotifs((data ?? []).map((t: any) => ({
            id: t.id, type: 'ticket' as const,
            title: t.project_name,
            subtitle: `Svc: ${t.services_status} · ${t.issue_case}`,
            time: t.created_at,
            url: '/ticketing', internalUrl: '/ticketing',
            menuTitle: 'Ticket Troubleshooting',
          })));
        } else {
          // Team PTS: ticket assigned ke mereka, status bukan Solved
          console.log('[notif] Team PTS query: assign_name =', assignedName);
          const { data } = await supabase
            .from('tickets')
            .select('id, project_name, issue_case, assign_name, status, created_at')
            .eq('assign_name', assignedName)
            .neq('status', 'Solved')
            .order('created_at', { ascending: false })
            .limit(30);
          console.log('[notif] Team PTS tickets found:', data?.length ?? 0, data?.map((t:any) => t.assign_name));
          setTicketNotifs((data ?? []).map((t: any) => ({
            id: t.id, type: 'ticket' as const,
            title: t.project_name,
            subtitle: `${t.status} · ${t.issue_case}`,
            time: t.created_at,
            url: '/ticketing', internalUrl: '/ticketing',
            menuTitle: 'Ticket Troubleshooting',
          })));
        }
      } else {
        // Sales dan role lain: tidak dapat notif ticket
        setTicketNotifs([]);
      }
    } catch (e) { console.error('[notif] ticket fetch error:', e); }

    // ── 2. Form Require Project ──
    // Pakai memberTeamType dari team_members (sudah di-fetch di bagian ticket di atas)
    // Admin/Team PTS  : semua request belum completed/rejected
    // Guest/Sales     : hanya milik sendiri belum selesai
    // Team Services   : tidak dapat notif require
    const isEffectiveTeamServices = memberTeamType === 'Team Services';
    const isEffectiveTeamPTS = !isAdmin && (roleLC === 'team' || roleLC === 'team_pts') && memberTeamType !== 'Team Services';
    if (isEffectiveTeamServices) {
      setRequireNotifs([]);
    } else {
      try {
        let q = supabase
          .from('project_requests')
          .select('id, project_name, room_name, requester_name, status, created_at, requester_id')
          .neq('status', 'completed')
          .neq('status', 'rejected');
        if (!isAdmin && !isEffectiveTeamPTS) {
          // Guest / Sales: hanya milik sendiri
          q = q.eq('requester_id', currentUser.id);
        }
        const { data } = await q.order('created_at', { ascending: false }).limit(30);
        setRequireNotifs((data ?? []).map((r: any) => ({
          id: r.id, type: 'require' as const,
          title: r.project_name,
          subtitle: `${r.status === 'pending' ? '⏳ Waiting Approval' : r.status === 'approved' ? '✅ Approved' : r.status === 'in_progress' ? '🔄 In Progress' : r.status} · ${r.requester_name}`,
          time: r.created_at,
          url: '/form-require-project', internalUrl: '/form-require-project',
          menuTitle: 'Form Require Project',
        })));
      } catch (e) { console.error('[notif] require fetch error:', e); }
    }

    // ── 3. Reminder Schedule ──
    // Admin/Superadmin : semua reminder belum done/cancelled
    // Team PTS         : reminder di-assign ke mereka (assigned_to = username), belum done/cancelled
    // Guest/Sales/Services: tidak dapat notif reminder
    if (!isAdmin && !isEffectiveTeamPTS) {
      setReminderNotifs([]);
    } else {
      try {
        let q = supabase
          .from('reminders')
          .select('id, project_name, category, due_date, due_time, assigned_to, assign_name, status, created_at')
          .neq('status', 'done')
          .neq('status', 'cancelled');
        if (isEffectiveTeamPTS) {
          // Reminder assigned_to menyimpan username
          q = q.eq('assigned_to', currentUser.username);
        }
        const { data } = await q.order('due_date', { ascending: true }).limit(30);
        if (data) {
          const today = new Date().toISOString().split('T')[0];
          const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
          const prioritized = [...(data as any[])].sort((a, b) => {
            const aClose = a.due_date <= tomorrow ? -1 : 0;
            const bClose = b.due_date <= tomorrow ? -1 : 0;
            return aClose - bClose;
          });
          setReminderNotifs(prioritized.map((r: any) => ({
            id: r.id, type: 'reminder' as const,
            title: r.project_name,
            subtitle: `${r.category} · ${r.due_date === today ? '📅 Hari ini' : r.due_date === tomorrow ? '⏰ Besok' : r.due_date} ${r.due_time} · ${r.assign_name}`,
            time: r.created_at,
            url: '/reminder-schedule', internalUrl: '/reminder-schedule',
            menuTitle: 'Reminder Schedule',
          })));
        }
      } catch (e) { console.error('[notif] reminder fetch error:', e); }
    }

    // ── 4. Form Review Demo & BAST ──
    // Admin/Superadmin : semua review belum diisi (grade kosong)
    // Guest            : review milik sendiri (guest_username / sales_name)
    // Team PTS         : review yang di-assign ke mereka
    // Team Services    : tidak dapat notif review
    try {
      if (isEffectiveTeamServices) {
        setReviewNotifs([]);
      } else if (isAdmin) {
        const { data } = await supabase
          .from('form_reviews')
          .select('id, project_name, reminder_category, sales_name, assign_name, created_at, grade_product_knowledge, grade_product_knowledge_bast, grade_training_customer')
          .order('created_at', { ascending: false })
          .limit(50);
        const pending = (data ?? []).filter((r: any) =>
          !r.grade_product_knowledge && !r.grade_product_knowledge_bast && !r.grade_training_customer
        );
        setReviewNotifs(pending.map((r: any) => ({
          id: r.id, type: 'require' as const,
          title: r.project_name,
          subtitle: `⭐ ${r.reminder_category} · ${r.sales_name}`,
          time: r.created_at,
          url: '/form-review', internalUrl: '/form-review',
          menuTitle: 'Form Review Demo & BAST',
        })));
      } else if (isGuest) {
        const { data } = await supabase
          .from('form_reviews')
          .select('id, project_name, reminder_category, sales_name, assign_name, created_at, grade_product_knowledge, grade_product_knowledge_bast, grade_training_customer')
          .or(`guest_username.eq.${currentUser.username},sales_name.eq.${currentUser.full_name}`)
          .order('created_at', { ascending: false })
          .limit(30);
        const pending = (data ?? []).filter((r: any) =>
          !r.grade_product_knowledge && !r.grade_product_knowledge_bast && !r.grade_training_customer
        );
        setReviewNotifs(pending.map((r: any) => ({
          id: r.id, type: 'require' as const,
          title: r.project_name,
          subtitle: `⭐ ${r.reminder_category} · Belum diisi`,
          time: r.created_at,
          url: '/form-review', internalUrl: '/form-review',
          menuTitle: 'Form Review Demo & BAST',
        })));
      } else if (isEffectiveTeamPTS) {
        const { data } = await supabase
          .from('form_reviews')
          .select('id, project_name, reminder_category, sales_name, assign_name, created_at, grade_product_knowledge, grade_product_knowledge_bast, grade_training_customer')
          .eq('assigned_to', currentUser.username)
          .order('created_at', { ascending: false })
          .limit(30);
        const pending = (data ?? []).filter((r: any) =>
          !r.grade_product_knowledge && !r.grade_product_knowledge_bast && !r.grade_training_customer
        );
        setReviewNotifs(pending.map((r: any) => ({
          id: r.id, type: 'require' as const,
          title: r.project_name,
          subtitle: `⭐ ${r.reminder_category} · ${r.sales_name}`,
          time: r.created_at,
          url: '/form-review', internalUrl: '/form-review',
          menuTitle: 'Form Review Demo & BAST',
        })));
      } else {
        setReviewNotifs([]);
      }
    } catch (e) { console.error('[notif] review fetch error:', e); }
  }, [currentUser, isAdmin, roleLC, teamType]);

  // Trigger fetchAll saat pertama mount dan setiap kali fetchAll berubah (= saat currentUser berubah)
  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 20000); // setiap 20 detik
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Realtime subscriptions — trigger ulang fetchAll setiap ada perubahan di DB
  useEffect(() => {
    const ch1 = supabase.channel('dash-notif-tickets-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        setTimeout(fetchAll, 400);
      })
      .subscribe();
    const ch2 = supabase.channel('dash-notif-requires-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_requests' }, () => {
        setTimeout(fetchAll, 400);
      })
      .subscribe();
    const ch3 = supabase.channel('dash-notif-reminders-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, () => {
        setTimeout(fetchAll, 400);
      })
      .subscribe();
    const ch4 = supabase.channel('dash-notif-reviews-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'form_reviews' }, () => {
        setTimeout(fetchAll, 400);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      supabase.removeChannel(ch3);
      supabase.removeChannel(ch4);
    };
  }, [fetchAll]);

  const handleClick = (item: NotificationItem) => {
    if (item.internalUrl) {
      onNavigate(item.internalUrl, item.menuTitle);
    }
  };

  const totalCount = ticketNotifs.length + requireNotifs.length + reminderNotifs.length + reviewNotifs.length;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-2xl"
      style={{
        background: totalCount > 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.45)',
        border: totalCount > 0 ? '1.5px solid rgba(0,0,0,0.12)' : '1.5px solid rgba(0,0,0,0.07)',
        backdropFilter: 'blur(12px)',
        boxShadow: totalCount > 0 ? '0 2px 16px rgba(0,0,0,0.10)' : 'none',
      }}
    >
      {/* Total badge */}
      {totalCount > 0 && (
        <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200 mr-1">
          <div className="relative">
            <div className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center animate-bounce">
              {totalCount > 9 ? '9+' : totalCount}
            </span>
          </div>
          <span className="text-[10px] font-bold text-slate-600 hidden md:block">Notif</span>
        </div>
      )}

      {/* Ticket Bell */}
      <NotifBell
        icon="🎫"
        label="Ticket"
        count={ticketNotifs.length}
        color="#dc2626"
        bgColor="rgba(254,242,242,0.9)"
        borderColor="rgba(252,165,165,0.8)"
        dotColor="#ef4444"
        items={ticketNotifs}
        onItemClick={handleClick}
      />

      {/* Require Bell — tidak untuk Team Services */}
      {!isTeamServices && (
      <NotifBell
        icon="🏗️"
        label="Require"
        count={requireNotifs.length}
        color="#7c3aed"
        bgColor="rgba(245,243,255,0.9)"
        borderColor="rgba(196,181,253,0.8)"
        dotColor="#8b5cf6"
        items={requireNotifs}
        onItemClick={handleClick}
      />
      )}

      {/* Reminder Bell — tampil untuk admin/superadmin dan semua role 'team' yang bukan Team Services */}
      {(isAdmin || (roleLC === 'team' && !isTeamServices)) && (
      <NotifBell
        icon="⏰"
        label="Reminder"
        count={reminderNotifs.length}
        color="#0891b2"
        bgColor="rgba(236,254,255,0.9)"
        borderColor="rgba(103,232,249,0.8)"
        dotColor="#06b6d4"
        items={reminderNotifs}
        onItemClick={handleClick}
      />
      )}

      {/* Review Bell — admin, guest, team PTS */}
      {!isTeamServices && (
      <NotifBell
        icon="⭐"
        label="Review"
        count={reviewNotifs.length}
        color="#7c3aed"
        bgColor="rgba(245,243,255,0.9)"
        borderColor="rgba(196,181,253,0.8)"
        dotColor="#a78bfa"
        items={reviewNotifs}
        onItemClick={handleClick}
      />
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [showRegister, setShowRegister] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    full_name: '',
    username: '',
    password: '',
    confirm_password: '',
    sales_division: '',
  });
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuLoading, setMenuLoading] = useState(false);

  const [showSidebar, setShowSidebar] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [iframeTitle, setIframeTitle] = useState<string>('');
  const [showTicketing, setShowTicketing] = useState(false);
  const [internalUrl, setInternalUrl] = useState<string>('/ticketing');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [showSettings, setShowSettings] = useState(false);


  const allMenuItems: MenuItem[] = [
    {
      title: 'Reminder Schedule', icon: '🗓️', key: 'reminder-schedule',
      gradient: 'from-cyan-700 via-cyan-600 to-teal-500',
      description: 'Jadwal & reminder pekerjaan team PTS                 ',
      items: [{ name: 'Reminder', url: '/reminder-schedule2', icon: '⏰', internal: true, embed: true }]
    },
    {
      title: 'Form Require Project', icon: '🏗️', key: 'form-require-project',
      gradient: 'from-violet-700 via-violet-600 to-violet-500',
      description: 'Solution request form untuk project Sales                  ',
      items: [{ name: 'Submit Require', url: '/form-require-project2', icon: '📋', internal: true, embed: true }]
    },
    {
      title: 'Form Review Demo & BAST', icon: '⭐', key: 'form-bast',
      gradient: 'from-slate-700 via-slate-600 to-slate-500',
      description: 'Platform review Demo Produk & BAST'                         ,
      items: [{ name: 'Platform Review', url: '/form-review', icon: '⭐', internal: true, embed: true }]
    },
    {
      title: 'Ticket Troubleshooting', icon: '🎫', key: 'ticket-troubleshooting',
      gradient: 'from-rose-700 via-rose-600 to-rose-500',
      description: 'Technical support & issue tracking                        ',
      items: [{ name: 'Ticket Management', url: '/ticketing', icon: '🔧', internal: true, embed: true }]
    },
    {
      title: 'Daily Report', icon: '📈', key: 'daily-report',
      gradient: 'from-emerald-700 via-emerald-600 to-emerald-500',
      description: 'Activity tracking & performance metrics',
      items: [
        { name: 'Submit Daily Report', url: 'https://docs.google.com/forms/d/e/1FAIpQLSf2cCEPlQQcCR1IZ3GRx-ImgdJJ15rMxAoph77aNYmbl15gvw/viewform?embedded=true', icon: '✍️', embed: true },
        { name: 'View Daily Report', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRMeC3gBgeCAe5YNoVE4RfdANVyjx7xmtTA7C-G40KhExzgvAJ4cGTcyFcgbp4WWx7laBdC3VZrBGd0/pubhtml?gid=1408443365&single=true', icon: '📑', embed: true },
        { name: 'Chart Daily Report', url: 'https://onedrive.live.com/edit?cid=25d404c0b5ee2b43&id=25D404C0B5EE2B43!s232e8289fcce47eaa1561794879e62bc&resid=25D404C0B5EE2B43!s232e8289fcce47eaa1561794879e62bc&ithint=file%2Cxlsx&embed=1&em=2&AllowTyping=True&ActiveCell=%27Report%27!H3&wdHideGridlines=True&wdHideHeaders=True&wdDownloadButton=True&wdInConfigurator=True%2CTrue&edaebf=ctrl&migratedtospo=true', icon: '📊', embed: true }
      ]
    },
    {
      title: 'Database PTS', icon: '💼', key: 'database-pts',
      gradient: 'from-indigo-700 via-indigo-600 to-indigo-500',
      description: 'Central repository & documentation',
      items: [{ name: 'Access Database', url: 'https://1drv.ms/f/c/25d404c0b5ee2b43/IgBDK-61wATUIIAlAgQAAAAAARPyRqbKPJAap5G_Ol5NmA8?e=fFU8wh', icon: '🗃️', embed: false, external: true }]
    },
    {
      title: 'Unit Movement Log', icon: '🚚', key: 'unit-movement',
      gradient: 'from-amber-700 via-amber-600 to-amber-500',
      description: 'Equipment check-in & check-out tracking',
      items: [
        { name: 'Submit Movement Log', url: 'https://docs.google.com/forms/d/e/1FAIpQLSfnfNZ1y96xei0KdMDewxGRr2nALwA0ZLW-kKPyGh5_YhK4HA/viewform?embedded=true', icon: '✍️', embed: true },
        { name: 'View Movement Log', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQIVshcP1qgXMwm121wufhmpEIze-I_99qaQb1ZnuUbekpvOV-xsfKX4p-16d1UHzG3mRHIpQcNriav/pubhtml?gid=383533237&single=true', icon: '📑', embed: true }
      ]
    },
  ];

  const [visibleMenuItems, setVisibleMenuItems] = useState<MenuItem[]>([]);

  useEffect(() => {
    if (!currentUser) return;
    setMenuLoading(true);
    const timer = setTimeout(() => {
      const allowed = currentUser.allowed_menus;
      const roleLC = currentUser.role?.toLowerCase();
      if (!allowed || roleLC === 'superadmin' || roleLC === 'admin') {
        setVisibleMenuItems(allMenuItems);
      } else {
        setVisibleMenuItems(allMenuItems.filter(m => allowed.includes(m.key)));
      }
      setMenuLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [currentUser]);

  const handleLogin = async () => {
    try {
      const { data, error } = await supabase.from('users').select('*').eq('username', loginForm.username).eq('password', loginForm.password).single();
      if (error || !data) { alert('Username atau password salah!'); return; }
      // Blokir user yang masih Pending Approval
      if (data.team_type === 'Pending Approval') {
        alert('Akun kamu masih menunggu persetujuan admin.\nKamu akan dihubungi setelah akun diaktifkan.');
        return;
      }
      setCurrentUser(data);
      setIsLoggedIn(true);
      const now = Date.now();
      localStorage.setItem('currentUser', JSON.stringify(data));
      localStorage.setItem('loginTime', now.toString());
    } catch { alert('Login gagal!'); }
  };

  const handleRegister = async () => {
    const { full_name, username, password, confirm_password, sales_division } = registerForm;
    if (!full_name.trim()) { alert('Nama lengkap wajib diisi!'); return; }
    if (!username.trim()) { alert('Email / username wajib diisi!'); return; }
    if (!password || password.length < 6) { alert('Password minimal 6 karakter!'); return; }
    if (password !== confirm_password) { alert('Konfirmasi password tidak cocok!'); return; }
    if (!sales_division) { alert('Pilih divisi sales!'); return; }
    setRegisterLoading(true);
    try {
      // Check if username already exists
      const { data: existing } = await supabase.from('users').select('id').eq('username', username.trim().toLowerCase()).maybeSingle();
      if (existing) { alert('Username / email sudah terdaftar. Gunakan username lain.'); setRegisterLoading(false); return; }
      // Insert user dengan role 'guest' tapi team_type 'Pending Approval' sebagai penanda belum diapprove admin
      // (role 'pending' tidak ada di CHECK constraint Supabase)
      const { error } = await supabase.from('users').insert([{
        full_name: full_name.trim(),
        username: username.trim().toLowerCase(),
        password: password,
        role: 'guest',
        sales_division: sales_division,
        team_type: 'Pending Approval',
        allowed_menus: [],
      }]);
      if (error) throw error;
      setRegisterSuccess(true);
      setRegisterForm({ full_name: '', username: '', password: '', confirm_password: '', sales_division: '' });
    } catch (err: any) {
      alert('Registrasi gagal: ' + err.message);
    }
    setRegisterLoading(false);
  };

  const handleLogout = () => {
    setIsLoggedIn(false); setCurrentUser(null);
    localStorage.removeItem('currentUser');
    setShowSidebar(false); setIframeUrl(null); setShowTicketing(false); setInternalUrl('/ticketing'); setShowSettings(false);
    router.push('/dashboard');
  };

  const handleMenuClick = (item: MenuItem['items'][0], menuTitle: string) => {
    if (item.external && !item.embed) {
      window.open(item.url, '_blank');
      return;
    }
    // Reset state terlebih dahulu agar React re-render iframe (force refresh)
    setIframeUrl(null);
    setShowTicketing(false);
    setInternalUrl('/ticketing');
    // Sedikit delay agar state reset bisa ter-apply sebelum set baru
    setTimeout(() => {
      if (item.internal) {
        setShowSidebar(true); setShowTicketing(true);
        setInternalUrl(item.url);
        setIframeTitle(`${menuTitle} - ${item.name}`);
      } else if (item.embed) {
        setShowSidebar(true); setIframeUrl(item.url);
        setIframeTitle(`${menuTitle} - ${item.name}`);
      }
    }, 150);
  };

  // Handler for notification bar navigation
  const handleNotifNavigate = (navInternalUrl: string, title: string) => {
    // Reset state dulu ke null agar React selalu re-render iframe meskipun URL sama
    setIframeUrl(null);
    setShowTicketing(false);
    setInternalUrl('/ticketing'); // reset sementara
    setIframeTitle('');
    // Setelah reset, set URL tujuan — iframe akan mount ulang & fetch data fresh
    setTimeout(() => {
      setShowTicketing(true);
      setInternalUrl(navInternalUrl);
      setIframeTitle(title);
      setShowSidebar(true);
    }, 150);
  };

  const handleBackToDashboard = () => {
    setShowSidebar(false); setIframeUrl(null); setShowTicketing(false); setInternalUrl('/ticketing'); setIframeTitle('');
  };

  useEffect(() => {
    const load = async () => {
      const saved = localStorage.getItem('currentUser');
      const savedTime = localStorage.getItem('loginTime');
      if (!saved) { setLoading(false); return; }
      // Cek session timeout (6 jam)
      if (savedTime) {
        const sixHours = 6 * 60 * 60 * 1000;
        if (Date.now() - parseInt(savedTime) > sixHours) {
          localStorage.removeItem('currentUser');
          localStorage.removeItem('loginTime');
          setLoading(false);
          return; // Akan tampilkan login form dashboard
        }
      }
      try {
        const parsed: User = JSON.parse(saved);
        setCurrentUser(parsed);
        setIsLoggedIn(true);
        const { data, error } = await supabase.from('users').select('*').eq('id', parsed.id).single();
        if (!error && data) {
          const fresh = data as User;
          setCurrentUser(fresh);
          localStorage.setItem('currentUser', JSON.stringify(fresh));
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
    // Cek session tiap menit
    const interval = setInterval(() => {
      const t = localStorage.getItem('loginTime');
      if (!t) return;
      if (Date.now() - parseInt(t) > 6 * 60 * 60 * 1000) {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('loginTime');
        setIsLoggedIn(false);
        setCurrentUser(null);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-cover bg-center bg-fixed" style={{ backgroundImage: 'url(/IVP_Background.png)' }}>
      <div className="bg-white/75 backdrop-blur-sm p-12 rounded-lg shadow-2xl border border-slate-200">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-slate-300 border-t-rose-600 rounded-full animate-spin"></div>
          <p className="text-lg font-medium text-slate-700 tracking-wide">Loading Portal...</p>
        </div>
      </div>
    </div>
  );

  if (!isLoggedIn) return (
    <div className="min-h-screen flex items-center justify-center bg-cover bg-center bg-fixed p-4" style={{ backgroundImage: 'url(/IVP_Background.png)' }}>
      <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl w-full border border-white/60" style={{ maxWidth: showRegister ? 480 : 420 }}>

        {/* Tab toggle */}
        <div className="flex rounded-t-2xl overflow-hidden">
          <button onClick={() => { setShowRegister(false); setRegisterSuccess(false); }}
            className={`flex-1 py-4 text-sm font-bold tracking-wide transition-all ${!showRegister ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-md' : 'bg-white/60 text-slate-500 hover:text-slate-700'}`}>
            🔐 Sign In
          </button>
          <button onClick={() => { setShowRegister(true); setRegisterSuccess(false); }}
            className={`flex-1 py-4 text-sm font-bold tracking-wide transition-all ${showRegister ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md' : 'bg-white/60 text-slate-500 hover:text-slate-700'}`}>
            📝 Register
          </button>
        </div>

        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-7">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg ${showRegister ? 'bg-gradient-to-br from-indigo-600 to-indigo-700' : 'bg-gradient-to-br from-rose-600 to-rose-700'}`}>
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {showRegister
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                }
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-1 tracking-tight">Work Management</h1>
            <p className="text-slate-500 text-sm font-medium">Support System — IndoVisual</p>
          </div>

          {/* LOGIN FORM */}
          {!showRegister && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-2 text-slate-600 tracking-widest uppercase">Username</label>
                <input type="text" value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition-all bg-white text-slate-800 font-medium text-sm"
                  placeholder="Enter your username" onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
              </div>
              <div>
                <label className="block text-xs font-bold mb-2 text-slate-600 tracking-widest uppercase">Password</label>
                <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition-all bg-white text-slate-800 font-medium text-sm"
                  placeholder="Enter your password" onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
              </div>
              <button onClick={handleLogin} className="w-full bg-gradient-to-r from-rose-600 to-rose-700 text-white py-3.5 rounded-xl hover:from-rose-700 hover:to-rose-800 font-bold shadow-lg transition-all tracking-wide text-sm mt-2">
                🔐 Sign In to Portal
              </button>
              <p className="text-center text-xs text-slate-400 pt-1">Belum punya akun? <button onClick={() => setShowRegister(true)} className="text-indigo-600 font-bold hover:underline">Daftar di sini</button></p>
            </div>
          )}

          {/* REGISTER FORM */}
          {showRegister && (
            <div>
              {registerSuccess ? (
                <div className="text-center py-4">
                  <div className="text-6xl mb-4">🎉</div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">Registrasi Berhasil!</h3>
                  <p className="text-sm text-slate-600 mb-1">Akun kamu sudah terkirim untuk review.</p>
                  <p className="text-sm text-slate-500 mb-6">Admin akan menentukan role dan menu akses kamu. Kamu akan dihubungi setelah disetujui.</p>
                  <button onClick={() => { setShowRegister(false); setRegisterSuccess(false); }}
                    className="w-full bg-gradient-to-r from-rose-600 to-rose-700 text-white py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90">
                    ← Kembali ke Login
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold mb-1.5 text-slate-600 tracking-widest uppercase">Nama Lengkap *</label>
                    <input type="text" value={registerForm.full_name} onChange={e => setRegisterForm({ ...registerForm, full_name: e.target.value })}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all bg-white text-slate-800 text-sm font-medium"
                      placeholder="Nama lengkap kamu" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5 text-slate-600 tracking-widest uppercase">Email / Username *</label>
                    <input type="text" value={registerForm.username} onChange={e => setRegisterForm({ ...registerForm, username: e.target.value })}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all bg-white text-slate-800 text-sm font-medium"
                      placeholder="email atau username unik" />
                    <p className="text-[10px] text-slate-400 mt-1">Akan digunakan untuk login ke sistem</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5 text-slate-600 tracking-widest uppercase">Divisi Sales *</label>
                    <div className="relative">
                      <select value={registerForm.sales_division} onChange={e => setRegisterForm({ ...registerForm, sales_division: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all bg-white text-slate-800 text-sm appearance-none cursor-pointer">
                        <option value="">— Pilih Divisi Sales —</option>
                        {SALES_DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs">▾</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-slate-600 tracking-widest uppercase">Password *</label>
                      <input type="password" value={registerForm.password} onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all bg-white text-slate-800 text-sm font-medium"
                        placeholder="Min. 6 karakter" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-slate-600 tracking-widest uppercase">Konfirmasi *</label>
                      <input type="password" value={registerForm.confirm_password} onChange={e => setRegisterForm({ ...registerForm, confirm_password: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all bg-white text-slate-800 text-sm font-medium"
                        placeholder="Ulangi password"
                        onKeyDown={e => e.key === 'Enter' && handleRegister()} />
                    </div>
                  </div>
                  <div className="rounded-xl px-4 py-3 text-xs" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <p className="text-indigo-700 font-semibold">ℹ️ Info Pendaftaran</p>
                    <p className="text-indigo-600 mt-1">Setelah mendaftar, akun kamu akan <strong>menunggu persetujuan admin</strong> untuk penentuan role dan menu akses. Kamu akan dihubungi via WA atau email.</p>
                  </div>
                  <button onClick={handleRegister} disabled={registerLoading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white py-3.5 rounded-xl font-bold text-sm transition-all hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg">
                    {registerLoading ? '⏳ Mendaftarkan...' : '📝 Daftar Sekarang'}
                  </button>
                  <p className="text-center text-xs text-slate-400">Sudah punya akun? <button onClick={() => setShowRegister(false)} className="text-rose-600 font-bold hover:underline">Login di sini</button></p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const MenuLoadingOverlay = () => (
    <div className="flex-1 flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 border-4 border-slate-200 border-t-rose-500 rounded-full animate-spin"></div>
      <p className="text-slate-600 font-semibold tracking-wide">Memuat menu...</p>
    </div>
  );

  const PROJECT_KEYS = ['reminder-schedule', 'form-require-project', 'ticket-troubleshooting', 'form-bast'];
  const INTERNAL_KEYS = ['daily-report', 'database-pts', 'unit-movement'];

  const projectMenuItems = visibleMenuItems.filter(m => PROJECT_KEYS.includes(m.key));
  const internalMenuItems = visibleMenuItems.filter(m => INTERNAL_KEYS.includes(m.key));

  const renderMenuCard = (menu: MenuItem, index: number, _accentColor: string) => {
    const isSingleInternal = menu.items.length === 1 && !menu.items[0].external;

    return (
      <div
        key={menu.key}
        className={`bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-white/60 hover:-translate-y-1 ${isSingleInternal ? 'cursor-pointer group' : ''}`}
        style={{ animation: `fadeInUp 0.5s ease forwards`, animationDelay: `${index * 80}ms`, opacity: 0 }}
        onClick={isSingleInternal ? () => handleMenuClick(menu.items[0], menu.title) : undefined}
      >
        <div className={`bg-gradient-to-br ${menu.gradient} ${isSingleInternal ? 'p-8' : 'p-6'} relative overflow-hidden`}>
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white" />
            <div className="absolute -left-2 -bottom-2 w-16 h-16 rounded-full bg-white" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-4xl">{menu.icon}</div>
              <h3 className="text-xl font-bold tracking-tight text-white leading-tight">{menu.title}</h3>
            </div>
            <p className="text-white/90 text-sm font-medium line-clamp-2">{menu.description}</p>
          </div>
        </div>
        {/* Show buttons only for multi-item cards OR external single-item cards */}
        {!isSingleInternal && (
          <div className="p-5 space-y-3">
            {menu.items.map((item, itemIndex) => (
              <button
                key={itemIndex}
                onClick={e => { e.stopPropagation(); handleMenuClick(item, menu.title); }}
                className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-800 px-5 py-4 rounded-md font-semibold shadow-sm hover:shadow-md transition-all text-right flex items-center justify-end gap-4 group/item"
              >
                {item.external && !item.embed ? (
                  <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-slate-400 transition-transform group-hover/item:-translate-x-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                )}
                <span className="flex-1 text-sm tracking-wide text-right">{item.name}</span>
                <div className="w-10 h-10 bg-white rounded-md shadow-sm flex items-center justify-center text-xl border border-slate-200 group-hover/item:scale-110 transition-transform flex-shrink-0">
                  {item.icon}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!showSidebar) return (
    <div className="min-h-screen flex flex-col bg-cover bg-center bg-fixed" style={{ backgroundImage: 'url(/IVP_Background.png)' }}>
      {showSettings && <AccountSettingsModal onClose={() => setShowSettings(false)} />}

      {/* ── HEADER ── */}
      <div className="bg-white/80 backdrop-blur-md shadow-md border-b border-slate-200/70" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)', position: 'relative', zIndex: 9999 }}>
        <div className="w-full px-4 py-4">
          <div className="flex items-center justify-between gap-4">

            {/* LEFT: Logo */}
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="w-12 h-12 bg-gradient-to-br from-rose-600 to-rose-700 rounded-xl shadow-md flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <h1 className="text-xl font-bold text-slate-800 tracking-tight">Work Management Portal</h1>
                </div>
                <p className="text-slate-500 text-xs font-medium mt-0.5">IndoVisual Professional Tools</p>
              </div>
            </div>

            {/* CENTER: Notification Bar */}
            {currentUser && (
              <div className="flex-1 flex justify-center px-4">
                <NotificationBar
                  currentUser={currentUser}
                  onNavigate={handleNotifNavigate}
                />
              </div>
            )}

            {/* RIGHT: User + Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* User badge */}
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl border border-slate-200/80 bg-white/70 backdrop-blur-sm">
                <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #fde68a, #f59e0b)', color: '#78350f' }}>
                  {currentUser?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
                </div>
                <div className="leading-tight">
                  <p className="text-xs font-bold text-slate-800">{currentUser?.full_name}</p>
                  <p className="text-[9px] font-bold tracking-widest uppercase text-amber-600">{currentUser?.role}</p>
                </div>
              </div>
              {(['admin', 'superadmin'].includes(currentUser?.role?.toLowerCase() ?? '')) && (
                <button onClick={() => setShowSettings(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', color: '#4338ca' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.15)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.08)'; }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Settings
                </button>
              )}
              <button onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)', color: '#b91c1c' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.13)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.07)'; }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 overflow-y-auto py-8 px-4 md:px-8">
        <div className="max-w-[1600px] mx-auto space-y-8">
          {menuLoading ? <MenuLoadingOverlay /> : (
            <>
              {projectMenuItems.length > 0 && (
                <div style={{ animation: 'fadeInUp 0.45s ease forwards', opacity: 0 }}>
                  <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-xl"
                    style={{ background: 'rgba(15,23,42,0.72)', backdropFilter: 'blur(8px)', boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
                    <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)' }}>
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <span className="text-white font-bold text-sm tracking-wide">Project</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {projectMenuItems.map((menu, i) => renderMenuCard(menu, i, '#0ea5e9'))}
                  </div>
                </div>
              )}

              {internalMenuItems.length > 0 && (
                <div style={{ animation: 'fadeInUp 0.45s ease 0.1s forwards', opacity: 0 }}>
                  <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-xl"
                    style={{ background: 'rgba(15,23,42,0.72)', backdropFilter: 'blur(8px)', boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
                    <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #34d399, #059669)' }}>
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <span className="text-white font-bold text-sm tracking-wide">Internal Daily</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {internalMenuItems.map((menu, i) => renderMenuCard(menu, i, '#10b981'))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div className="bg-white/70 backdrop-blur-sm border-t border-slate-200/60">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <p className="text-slate-500 text-xs font-medium tracking-wide text-center">© 2026 IndoVisual — Work Management Support (PTS IVP)</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dropIn { from { opacity: 0; transform: translateY(-8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );

  // ── VIEW DENGAN SIDEBAR ──
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-cover bg-center bg-fixed" style={{ backgroundImage: 'url(/IVP_Background.png)' }}>
      {showSettings && <AccountSettingsModal onClose={() => setShowSettings(false)} />}

      {/* ── HEADER UTAMA (sama seperti dashboard) ── */}
      <div className="bg-white/80 backdrop-blur-md shadow-md flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)', position: 'relative', zIndex: 9999 }}>
        <div className="w-full px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* LEFT: Logo */}
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="w-12 h-12 bg-gradient-to-br from-rose-600 to-rose-700 rounded-xl shadow-md flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800 tracking-tight">Work Management Portal</h1>
                <p className="text-slate-500 text-xs font-medium mt-0.5">IndoVisual Professional Tools</p>
              </div>
            </div>
            {/* CENTER: Notification Bar */}
            {currentUser && (
              <div className="flex-1 flex justify-center px-4">
                <NotificationBar currentUser={currentUser} onNavigate={handleNotifNavigate} />
              </div>
            )}
            {/* RIGHT: User + Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl border border-slate-200/80 bg-white/70 backdrop-blur-sm">
                <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #fde68a, #f59e0b)', color: '#78350f' }}>
                  {currentUser?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
                </div>
                <div className="leading-tight">
                  <p className="text-xs font-bold text-slate-800">{currentUser?.full_name}</p>
                  <p className="text-[9px] font-bold tracking-widest uppercase text-amber-600">{currentUser?.role}</p>
                </div>
              </div>
              {(['admin', 'superadmin'].includes(currentUser?.role?.toLowerCase() ?? '')) && (
                <button onClick={() => setShowSettings(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', color: '#4338ca' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.15)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.08)'; }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Settings
                </button>
              )}
              <button onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)', color: '#b91c1c' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.13)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.07)'; }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── BODY: SIDEBAR + KONTEN ── */}
      <div className="flex flex-1 overflow-hidden">

      {/* SIDEBAR */}
      <div className={`relative flex flex-col transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'w-[72px]' : 'w-[288px]'}`}
        style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '4px 0 24px rgba(0,0,0,0.12)' }}>
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #c8861d, transparent)' }} />

        <div className={`flex items-center border-b px-4 py-5 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`} style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #e2a84b, #c8861d)' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.2em] uppercase" style={{ color: '#c8861d' }}>IndoVisual</p>
                <p className="font-bold text-sm leading-none tracking-wide" style={{ color: '#0f172a' }}>PTS Portal</p>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #e2a84b, #c8861d)' }}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
            </div>
          )}
          {!sidebarCollapsed && (
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-1.5 rounded-md transition-all hover:bg-black/10 text-slate-400 hover:text-slate-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" /></svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3" style={{ scrollbarWidth: 'none' }}>
          <button onClick={handleBackToDashboard}
            className={`w-full group flex items-center gap-3 px-3 py-2.5 mb-4 rounded-xl font-semibold text-sm transition-all ${sidebarCollapsed ? 'justify-center' : ''}`}
            style={{ background: 'linear-gradient(135deg, rgba(200,134,29,0.12), rgba(200,134,29,0.06))', border: '1px solid rgba(200,134,29,0.3)', color: '#92600a' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(200,134,29,0.22), rgba(200,134,29,0.14))'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(200,134,29,0.12), rgba(200,134,29,0.06))'; }}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            {!sidebarCollapsed && <span className="tracking-wide">Main Menu</span>}
          </button>

          {!sidebarCollapsed && <div className="mb-3" />}

          {menuLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(226,168,75,0.4)', borderTopColor: '#e2a84b' }}></div>
            </div>
          ) : sidebarCollapsed ? (
            /* Collapsed: icon-only buttons */
            <div className="space-y-1">
              {visibleMenuItems.map((menu) => (
                <div key={menu.key} className="group relative">
                  <div className="flex flex-col gap-1">
                    {menu.items.map((item, itemIndex) => {
                      const isActive = (showTicketing && item.internal && internalUrl === item.url) || (iframeUrl === item.url);
                      return (
                        <button key={itemIndex} onClick={() => handleMenuClick(item, menu.title)} title={`${menu.title} — ${item.name}`}
                          className="w-full h-9 rounded-lg flex items-center justify-center text-base transition-all"
                          style={isActive ? { background: 'rgba(200,134,29,0.18)', border: '1px solid rgba(200,134,29,0.45)', color: '#b8760d' } : { background: 'rgba(0,0,0,0.04)', border: '1px solid transparent', color: '#64748b' }}>
                          {menu.icon}
                        </button>
                      );
                    })}
                  </div>
                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))' }}>
                    <div className="rounded-xl px-4 py-3 min-w-[160px]" style={{ background: '#f8fafc', border: '1px solid rgba(200,134,29,0.25)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
                      <p className="text-[11px] font-bold tracking-widest uppercase mb-2" style={{ color: '#b8760d' }}>{menu.title}</p>
                      {menu.items.map((item, idx) => <p key={idx} className="text-xs text-slate-500 leading-5">{item.icon} {item.name}</p>)}
                    </div>
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-[6px] border-transparent" style={{ borderRightColor: '#f8fafc' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">

              {/* ── Project group ── */}
              {visibleMenuItems.filter(m => PROJECT_KEYS.includes(m.key)).length > 0 && (
                <div>
                  <p className="px-1 mb-2 text-xs font-bold tracking-wide uppercase" style={{ color: 'rgba(0,0,0,0.55)' }}>Project</p>
                  <div className="space-y-0.5">
                    {visibleMenuItems.filter(m => PROJECT_KEYS.includes(m.key)).map((menu) => {
                      const MENU_ICONS: Record<string, JSX.Element> = {
                        'reminder-schedule': <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
                        'form-require-project': <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
                        'form-bast': <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
                        'ticket-troubleshooting': <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>,
                      };
                      if (menu.items.length === 1) {
                        const item = menu.items[0];
                        const isActive = (showTicketing && item.internal && internalUrl === item.url) || (iframeUrl === item.url);
                        return (
                          <button key={menu.key} onClick={() => handleMenuClick(item, menu.title)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left font-medium transition-all"
                            style={isActive ? { background: 'rgba(200,134,29,0.12)', border: '1px solid rgba(200,134,29,0.3)', color: '#92600a' } : { background: 'transparent', border: '1px solid transparent', color: '#1e293b' }}
                            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.06)'; }}
                            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                            <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: isActive ? 'rgba(200,134,29,0.15)' : 'rgba(0,0,0,0.07)' }}>
                              {MENU_ICONS[menu.key] ?? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/></svg>}
                            </span>
                            <span className="truncate text-sm tracking-wide">{menu.title}</span>
                            {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#b8760d' }} />}
                          </button>
                        );
                      }
                      return null; // Project group has no multi-item menus currently
                    })}
                  </div>
                </div>
              )}

              {/* ── Internal Daily group — fully flat, no sub-cards ── */}
              {visibleMenuItems.filter(m => INTERNAL_KEYS.includes(m.key)).length > 0 && (
                <div>
                  <p className="px-1 mb-2 text-xs font-bold tracking-wide uppercase" style={{ color: 'rgba(0,0,0,0.55)' }}>Internal Daily</p>
                  <div className="space-y-0.5">
                    {(() => {
                      const ITEM_ICONS: Record<string, JSX.Element> = {
                        'Submit Daily Report':   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
                        'View Daily Report':     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
                        'Chart Daily Report':    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
                        'Access Database':       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg>,
                        'Submit Movement Log':   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293h3.172a1 1 0 00.707-.293l2.414-2.414a1 1 0 01.707-.293H20" /></svg>,
                        'View Movement Log':     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
                      };
                      const flatItems: { label: string; url: string; embed: boolean; external?: boolean; menuTitle: string; item: MenuItem['items'][0] }[] = [];
                      visibleMenuItems.filter(m => INTERNAL_KEYS.includes(m.key)).forEach(menu => {
                        menu.items.forEach(item => flatItems.push({ label: item.name, url: item.url, embed: !!item.embed, external: item.external, menuTitle: menu.title, item }));
                      });
                      return flatItems.map(({ label, menuTitle, item }, idx) => {
                        const isActive = (showTicketing && item.internal && internalUrl === item.url) || (iframeUrl === item.url);
                        return (
                          <button key={idx} onClick={() => handleMenuClick(item, menuTitle)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left font-medium transition-all"
                            style={isActive ? { background: 'rgba(200,134,29,0.12)', border: '1px solid rgba(200,134,29,0.3)', color: '#92600a' } : { background: 'transparent', border: '1px solid transparent', color: '#1e293b' }}
                            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.06)'; }}
                            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                            <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: isActive ? 'rgba(200,134,29,0.15)' : 'rgba(0,0,0,0.07)', color: isActive ? '#92600a' : '#475569' }}>
                              {ITEM_ICONS[label] ?? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/></svg>}
                            </span>
                            <span className="truncate text-sm tracking-wide">{label}</span>
                            {item.external && !item.embed && <svg className="ml-auto w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>}
                            {isActive && !item.external && <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#b8760d' }} />}
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        <div className="p-3 space-y-1.5" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          {sidebarCollapsed && (
            <button onClick={() => setSidebarCollapsed(false)} className="w-full flex justify-center p-2 rounded-xl transition-all text-slate-400 hover:text-slate-700" style={{ background: 'rgba(0,0,0,0.05)' }} title="Expand sidebar">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M6 5l7 7-7 7" /></svg>
            </button>
          )}
        </div>
      </div>

		{/* MAIN CONTENT */}
		<div className="flex-1 flex flex-col overflow-y-auto">
		  <>
			{/* Header breadcrumb dihapus */}

			<div className="flex-1 overflow-hidden bg-white">
			  {showTicketing ? (
				<div className="w-full h-full overflow-auto">
				  <iframe src={internalUrl} className="w-full h-full border-0" title={iframeTitle} />
				</div>
			  ) : iframeUrl ? (
				<iframe src={iframeUrl} className="w-full h-full border-0" title={iframeTitle} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
			  ) : null}
			</div>
		  </>
		</div>

      <style jsx>{`
        @keyframes dropIn { from { opacity: 0; transform: translateY(-8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
      </div>{/* end BODY flex row */}

      {/* ── FOOTER — full width, outside sidebar+content row ── */}
      <div className="bg-white/75 backdrop-blur-sm border-t border-slate-200 shadow-lg flex-shrink-0">
        <div className="w-full px-6 py-4 flex items-center justify-center">
          <p className="text-slate-700 text-sm font-semibold tracking-wide text-center">© 2026 IndoVisual - Work Management Support (PTS IVP)</p>
        </div>
      </div>
    </div>
  );
}
