'use client';

// ══════════════════════════════════════════════════════════════════════════════
// REMINDER SCHEDULE SERVICES — Platform Team Services (Servisindo)
// DB: Supabase Services (terpisah dari PTS)
// Handler: Team Services saja (tidak ada Team PTS)
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

// ── Supabase client — lazy init agar tidak crash saat prerender Vercel ─────────
let _supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY belum diset');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// ── WA via Supabase Edge Function ─────────────────────────────────────────────
async function sendFonnteWA(target: string, message: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const res = await fetch(`${url}/functions/v1/swift-responder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key },
      body: JSON.stringify({ type: 'reminder_wa', target, message }),
    });
    const data = await res.json();
    return { ok: data?.ok === true, reason: data?.reason };
  } catch (e: any) { return { ok: false, reason: e.message }; }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Priority = 'low' | 'medium' | 'high' | 'urgent';
type Status = 'pending' | 'done' | 'cancelled';

interface Reminder {
  id: string;
  project_name: string;
  description: string;
  assigned_to: string;
  assign_name: string;
  due_date: string;
  due_time: string;
  priority: Priority;
  status: Status;
  category: string;
  sales_name: string;
  sales_division: string;
  address: string;
  pic_name: string;
  pic_phone: string;
  created_by: string;
  created_at: string;
  notes?: string;
  product?: string;
  completion_photo_url?: string;
  updated_at?: string;
}

interface TeamUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
  phone_number?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string; dot: string }> = {
  low:    { label: 'Low',    color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', dot: '#94a3b8' },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  dot: '#f59e0b' },
  high:   { label: 'High',   color: '#f97316', bg: 'rgba(249,115,22,0.15)',  dot: '#f97316' },
  urgent: { label: 'Urgent', color: '#f43f5e', bg: 'rgba(244,63,94,0.2)',    dot: '#f43f5e' },
};

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string; border: string; icon: string }> = {
  pending:   { label: 'Pending',   color: '#92400e', bg: '#fef3c7', border: '#f59e0b', icon: '⏳' },
  done:      { label: 'Completed', color: '#065f46', bg: '#d1fae5', border: '#10b981', icon: '✅' },
  cancelled: { label: 'Cancelled', color: '#374151', bg: '#f3f4f6', border: '#6b7280', icon: '❌' },
};

const CATEGORIES_SVC = [
  'Perbaikan Unit', 'Pengecekan Garansi', 'RMA', 'Penggantian Sparepart',
  'Kunjungan Teknisi', 'Demo Produk', 'Training', 'Internal', 'Lainnya',
];

const CATEGORY_COLORS: Record<string, string> = {
  'Perbaikan Unit':       '#dc2626', 'Pengecekan Garansi':   '#2563eb',
  'RMA':                  '#7c3aed', 'Penggantian Sparepart':'#d97706',
  'Kunjungan Teknisi':    '#059669', 'Demo Produk':          '#0891b2',
  'Training':             '#db2777', 'Internal':             '#65a30d', 'Lainnya': '#64748b',
};

const PIE_COLORS = ['#dc2626','#2563eb','#059669','#d97706','#7c3aed','#0891b2','#db2777','#65a30d','#f97316','#14b8a6'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(s: string) {
  if (!s) return '';
  return new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
function isDueToday(d: string) { return d === new Date().toISOString().split('T')[0]; }
function isDueSoon(d: string) {
  const diff = (new Date(d + 'T00:00:00').getTime() - Date.now()) / 86400000;
  return diff >= 0 && diff <= 3;
}

// ── Mini Donut ─────────────────────────────────────────────────────────────────
function MiniDonut({ data, title, total }: { data: { label: string; value: number; color: string }[]; title: string; total: number }) {
  const [hov, setHov] = useState<number | null>(null);
  if (total === 0) return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
      <p className="text-slate-300 text-sm text-center py-4">Belum ada data</p>
    </div>
  );
  let cum = -Math.PI / 2;
  const cx = 50, cy = 50, r = 42, ir = 22;
  const slices = data.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI;
    if (data.length === 1) return { ...d, path: '', isCircle: true, i };
    const x1 = cx + r * Math.cos(cum), y1 = cy + r * Math.sin(cum);
    const x2 = cx + r * Math.cos(cum + angle), y2 = cy + r * Math.sin(cum + angle);
    const xi1 = cx + ir * Math.cos(cum), yi1 = cy + ir * Math.sin(cum);
    const xi2 = cx + ir * Math.cos(cum + angle), yi2 = cy + ir * Math.sin(cum + angle);
    const large = angle > Math.PI ? 1 : 0;
    const path = `M${xi1} ${yi1} L${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${xi2} ${yi2} A${ir} ${ir} 0 ${large} 0 ${xi1} ${yi1}Z`;
    cum += angle;
    return { ...d, path, isCircle: false, i };
  });
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">{title}</p>
      <div className="flex items-center gap-3">
        <svg width="100" height="100" viewBox="0 0 100 100" className="flex-shrink-0">
          {slices.map(s => s.isCircle
            ? <g key={s.i}><circle cx={cx} cy={cy} r={r} fill={s.color} opacity={hov === null || hov === s.i ? 1 : 0.45} /><circle cx={cx} cy={cy} r={ir} fill="white" /></g>
            : <path key={s.i} d={s.path} fill={s.color} opacity={hov === null || hov === s.i ? 1 : 0.45}
                style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                onMouseEnter={() => setHov(s.i)} onMouseLeave={() => setHov(null)} />
          )}
          <text x="50" y="47" textAnchor="middle" fontSize="13" fontWeight="800" fill="#1e293b">{total}</text>
          <text x="50" y="59" textAnchor="middle" fontSize="6" fill="#94a3b8" fontWeight="600">TOTAL</text>
        </svg>
        <div className="flex-1 min-w-0 space-y-1 max-h-[90px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5" onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
              <span className="text-[10px] text-slate-600 truncate flex-1">{d.label}</span>
              <span className="text-[10px] font-bold" style={{ color: d.color }}>{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Reminder Card ──────────────────────────────────────────────────────────────
function ReminderCard({ r, onDetail, onStatusChange, currentUser }: { r: Reminder; onDetail: () => void; onStatusChange: (id: string, status: Status) => void; currentUser: TeamUser | null }) {
  const pc = PRIORITY_CONFIG[r.priority];
  const sc = STATUS_CONFIG[r.status];
  const today = isDueToday(r.due_date);
  const soon = isDueSoon(r.due_date);
  const catColor = CATEGORY_COLORS[r.category] ?? '#64748b';
  const canAct = currentUser?.role === 'admin' || currentUser?.role === 'team';

  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border overflow-hidden cursor-pointer"
      style={{ borderColor: today ? '#dc2626' : soon ? '#f97316' : 'rgba(0,0,0,0.08)', borderLeftWidth: '3px', borderLeftColor: catColor }}
      onClick={onDetail}>
      {(today || soon) && (
        <div className="px-4 py-1.5 text-xs font-bold text-center" style={{ background: today ? '#dc2626' : '#f97316', color: 'white' }}>
          {today ? '🔴 DUE TODAY' : '⚠️ DUE SOON'}
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold mb-1.5"
              style={{ background: `${catColor}15`, color: catColor, border: `1px solid ${catColor}30` }}>
              {r.category}
            </span>
            <h3 className="font-bold text-slate-800 text-sm leading-tight line-clamp-1">{r.project_name}</h3>
            {r.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{r.description}</p>}
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border"
              style={{ color: sc.color, background: sc.bg, borderColor: sc.border }}>
              {sc.icon} {sc.label}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ color: pc.color, background: pc.bg }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: pc.dot }} />
              {pc.label}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 mb-3">
          <span>📅 <strong>{formatDate(r.due_date)}</strong> {r.due_time && `· ${r.due_time}`}</span>
          {r.assign_name && <span>👤 {r.assign_name}</span>}
          {r.sales_name && <span>🏢 {r.sales_name}</span>}
          {r.product && <span>📦 {r.product}</span>}
        </div>

        {r.address && <p className="text-xs text-slate-400 mb-3 truncate">📍 {r.address}</p>}

        {r.status === 'pending' && canAct && (
          <div className="flex gap-2" onClick={e => e.stopPropagation()}>
            <button onClick={() => onStatusChange(r.id, 'done')}
              className="flex-1 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#059669,#047857)' }}>✅ Selesai</button>
            <button onClick={() => onStatusChange(r.id, 'cancelled')}
              className="flex-1 py-1.5 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all">
              ❌ Batal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ReminderServices() {
  const [initializing, setInitializing] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<TeamUser | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginLoading, setLoginLoading] = useState(false);

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const notify = (type: 'success' | 'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500); };

  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all');
  const [filterYear, setFilterYear] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchProject, setSearchProject] = useState('');
  const [searchSales, setSearchSales] = useState('');
  const [searchHandler, setSearchHandler] = useState('');

  const [detailReminder, setDetailReminder] = useState<Reminder | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [sendingWA, setSendingWA] = useState<string | null>(null);
  const [appReady, setAppReady] = useState(false);

  const emptyForm = {
    project_name: '', description: '', assigned_to: '', assign_name: '',
    due_date: new Date().toISOString().split('T')[0], due_time: '09:00',
    priority: 'medium' as Priority, status: 'pending' as Status,
    category: 'Perbaikan Unit', sales_name: '', sales_division: '',
    address: '', pic_name: '', pic_phone: '', notes: '', product: '',
  };
  const [formData, setFormData] = useState(emptyForm);
  const fd = (p: Partial<typeof emptyForm>) => setFormData(prev => ({ ...prev, ...p }));

  // ── Auth init ────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('svc_currentUser');
    const savedTime = localStorage.getItem('svc_loginTime');
    if (saved && savedTime) {
      const sixH = 6 * 60 * 60 * 1000;
      if (Date.now() - parseInt(savedTime) > sixH) {
        localStorage.removeItem('svc_currentUser');
        localStorage.removeItem('svc_loginTime');
      } else {
        try {
          const user = JSON.parse(saved) as TeamUser;
          setCurrentUser(user); setIsLoggedIn(true);
        } catch { /* ignore */ }
      }
    }
    Promise.all([fetchTeamUsers(), fetchRemindersQuiet()]).then(() => {
      setAppReady(true);
      setInitializing(false);
    });

    const ch = getSupabase().channel('svc-reminders-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, () => fetchRemindersQuiet())
      .subscribe();
    return () => { getSupabase().removeChannel(ch); };
  }, []);

  // ── Session timeout ──────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const t = localStorage.getItem('svc_loginTime');
      if (t && Date.now() - parseInt(t) > 6 * 60 * 60 * 1000) {
        localStorage.removeItem('svc_currentUser'); localStorage.removeItem('svc_loginTime');
        setIsLoggedIn(false); setCurrentUser(null);
      }
    };
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, []);

  const fetchTeamUsers = async () => {
    const { data } = await getSupabase().from('users').select('id, username, full_name, role, phone_number').order('full_name');
    if (data) setTeamUsers(data as TeamUser[]);
  };

  const fetchRemindersQuiet = async () => {
    const { data } = await getSupabase().from('reminders').select('*').order('created_at', { ascending: false });
    if (data) setReminders(data as Reminder[]);
  };

  const handleLogin = async () => {
    setLoginLoading(true);
    try {
      const { data, error } = await getSupabase().from('users').select('*')
        .eq('username', loginForm.username).eq('password', loginForm.password).single();
      if (error || !data) { notify('error', 'Username atau password salah!'); setLoginLoading(false); return; }
      const user = data as TeamUser;
      setCurrentUser(user); setIsLoggedIn(true);
      localStorage.setItem('svc_currentUser', JSON.stringify(user));
      localStorage.setItem('svc_loginTime', Date.now().toString());
    } catch { notify('error', 'Login gagal.'); }
    setLoginLoading(false);
  };

  // ── CRUD ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formData.project_name.trim()) { notify('error', 'Nama project wajib diisi!'); return; }
    if (!formData.assigned_to) { notify('error', 'Pilih anggota team!'); return; }
    if (!formData.due_date) { notify('error', 'Tanggal wajib diisi!'); return; }
    const assignee = teamUsers.find(u => u.username === formData.assigned_to);
    const payload = { ...formData, assign_name: assignee?.full_name ?? formData.assigned_to, created_by: currentUser?.username ?? 'system' };
    setSaving(true);
    const { error } = editingReminder
      ? await getSupabase().from('reminders').update(payload).eq('id', editingReminder.id)
      : await getSupabase().from('reminders').insert([payload]);
    if (error) { notify('error', 'Gagal: ' + error.message); setSaving(false); return; }
    notify('success', editingReminder ? 'Reminder diperbarui!' : 'Reminder ditambahkan!');
    // WA notif
    if (!editingReminder && assignee?.phone_number) {
      const msg = `🗓️ *JADWAL BARU — Servisindo*\n\nHalo *${assignee.full_name}*, ada jadwal baru:\n\n*${formData.project_name}*\n🏷️ ${formData.category}\n📍 ${formData.address || '-'}\n🕐 ${formatDate(formData.due_date)} · ${formData.due_time}\n${formData.notes ? `📝 ${formData.notes}` : ''}\n\nSemangat! 💪`;
      await sendFonnteWA(assignee.phone_number, msg);
    }
    setSaving(false);
    setShowFormModal(false);
    setEditingReminder(null);
    setFormData(emptyForm);
    fetchRemindersQuiet();
  };

  const handleStatusChange = async (id: string, status: Status) => {
    await getSupabase().from('reminders').update({ status }).eq('id', id);
    notify('success', 'Status diperbarui!');
    fetchRemindersQuiet();
    if (detailReminder?.id === id) setDetailReminder(r => r ? { ...r, status } : r);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await getSupabase().from('reminders').delete().eq('id', deleteTarget.id);
    notify('success', 'Reminder dihapus.');
    setDetailReminder(null); setShowDeleteModal(false); setDeleteTarget(null); setDeleteConfirmText('');
    fetchRemindersQuiet();
  };

  const handleSendWA = async (r: Reminder) => {
    setSendingWA(r.id);
    const assignee = teamUsers.find(u => u.username === r.assigned_to);
    if (!assignee?.phone_number) { notify('error', 'Nomor WA tidak tersedia.'); setSendingWA(null); return; }
    const msg = `📋 *REMINDER — Servisindo*\n\nHalo *${assignee.full_name}*, jadwal menunggumu:\n\n*${r.project_name}*\n🏷️ ${r.category}\n📍 ${r.address || '-'}\n🕐 ${formatDate(r.due_date)} · ${r.due_time}\n${r.notes ? `📝 ${r.notes}` : ''}\n\n_Pesan dari Reminder Schedule Servisindo_`;
    const res = await sendFonnteWA(assignee.phone_number, msg);
    setSendingWA(null);
    if (res.ok) notify('success', `WA terkirim ke ${assignee.full_name}!`);
    else notify('error', `Gagal kirim WA: ${res.reason}`);
  };

  // ── Filters ───────────────────────────────────────────────────────────────
  const filteredReminders = useMemo(() => reminders.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterYear !== 'all' && !r.due_date.startsWith(filterYear)) return false;
    if (filterCategory !== 'all' && r.category !== filterCategory) return false;
    if (searchProject && !r.project_name?.toLowerCase().includes(searchProject.toLowerCase()) && !r.address?.toLowerCase().includes(searchProject.toLowerCase())) return false;
    if (searchSales && !r.sales_name?.toLowerCase().includes(searchSales.toLowerCase())) return false;
    if (searchHandler && !r.assign_name?.toLowerCase().includes(searchHandler.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    const aR = a.notes?.includes('[Re-Schedule') ?? false;
    const bR = b.notes?.includes('[Re-Schedule') ?? false;
    if (aR && !bR) return -1; if (!aR && bR) return 1;
    return (b.created_at || '').localeCompare(a.created_at || '');
  }), [reminders, filterStatus, filterYear, filterCategory, searchProject, searchSales, searchHandler]);

  const availableYears = useMemo(() => Array.from(new Set(reminders.map(r => r.due_date.substring(0, 4)))).sort((a, b) => b.localeCompare(a)), [reminders]);
  const todayCount = reminders.filter(r => isDueToday(r.due_date) && r.status === 'pending').length;
  const pendingCount = reminders.filter(r => r.status === 'pending').length;
  const doneCount = reminders.filter(r => r.status === 'done').length;
  const isAdmin = currentUser?.role === 'admin';
  const canAdd = isAdmin || currentUser?.role === 'team';

  // Pie data
  const catPieData = useMemo(() => {
    const m: Record<string, number> = {};
    reminders.forEach(r => { m[r.category] = (m[r.category] ?? 0) + 1; });
    return Object.entries(m).map(([label, value], i) => ({ label, value, color: PIE_COLORS[i % PIE_COLORS.length] }));
  }, [reminders]);

  const handlerPieData = useMemo(() => {
    const m: Record<string, number> = {};
    reminders.forEach(r => { if (r.assign_name) m[r.assign_name] = (m[r.assign_name] ?? 0) + 1; });
    return Object.entries(m).sort((a,b) => b[1]-a[1]).map(([label, value], i) => ({ label, value, color: PIE_COLORS[i % PIE_COLORS.length] }));
  }, [reminders]);

  const inp = 'w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none bg-white';

  // ── Loading ──────────────────────────────────────────────────────────────
  if (!appReady) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-red-600 rounded-full animate-spin" />
    </div>
  );

  if (!isLoggedIn) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg,#0f172a,#1a0505)' }}>
      {toast && <div className={`fixed top-5 right-5 z-[200] px-5 py-3.5 rounded-xl shadow-2xl text-sm font-bold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>{toast.type === 'success' ? '✅' : '❌'} {toast.msg}</div>}
      <div className="bg-white/95 rounded-3xl shadow-2xl p-8 w-full max-w-md" style={{ border: '1.5px solid rgba(220,38,38,0.25)' }}>
        <div className="flex justify-center mb-5">
          <div className="bg-black rounded-2xl px-6 py-3 shadow-lg">
            <img src="/logo-servisindo.png" alt="Servisindo" style={{ height: '40px', width: 'auto' }} />
          </div>
        </div>
        <h1 className="text-xl font-black text-center text-slate-800 mb-1">Reminder Schedule</h1>
        <p className="text-center text-slate-400 text-sm mb-6">Team Services · Servisindo</p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-2 text-slate-500 tracking-widest uppercase">Username</label>
            <input type="text" value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
              className={inp} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <div>
            <label className="block text-xs font-bold mb-2 text-slate-500 tracking-widest uppercase">Password</label>
            <input type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
              className={inp} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <button onClick={handleLogin} disabled={loginLoading}
            className="w-full text-white py-3.5 rounded-xl font-bold shadow-lg disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
            style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
            {loginLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</> : '🔐 Sign In'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)' }}>
      {toast && (
        <div className={`fixed top-5 right-5 z-[200] px-5 py-3.5 rounded-xl shadow-2xl text-sm font-bold flex items-center gap-2 text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10001] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" style={{ border: '2px solid rgba(220,38,38,0.3)' }}>
            <h3 className="font-bold text-lg text-slate-800 mb-2">Hapus Reminder?</h3>
            <p className="text-sm text-slate-500 mb-4">Ketik <strong className="text-red-600">HAPUS</strong> untuk konfirmasi.</p>
            <input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} className={inp + ' mb-3'} placeholder="Ketik HAPUS" />
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); setDeleteConfirmText(''); }}
                className="flex-1 border border-slate-300 text-slate-700 py-2.5 rounded-xl font-semibold hover:bg-slate-50">Batal</button>
              <button onClick={handleDelete} disabled={deleteConfirmText !== 'HAPUS'}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-semibold disabled:opacity-40">Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Panel */}
      {detailReminder && (
        <div className="fixed inset-0 z-[9000] flex">
          <div className="flex-1 bg-black/40" onClick={() => setDetailReminder(null)} />
          <div className="w-full max-w-lg bg-white flex flex-col overflow-hidden shadow-2xl" style={{ borderLeft: '3px solid #dc2626' }}>
            <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
              <div>
                <span className="text-white/70 text-xs font-bold uppercase tracking-widest">{detailReminder.category}</span>
                <h3 className="font-black text-white text-base mt-0.5 line-clamp-1">{detailReminder.project_name}</h3>
              </div>
              <div className="flex items-center gap-2">
                {canAdd && (
                  <button onClick={() => { setEditingReminder(detailReminder); setFormData({ ...emptyForm, ...detailReminder }); setShowFormModal(true); setDetailReminder(null); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/20 text-white hover:bg-white/30">✏️ Edit</button>
                )}
                {isAdmin && (
                  <button onClick={() => { setDeleteTarget(detailReminder); setShowDeleteModal(true); setDetailReminder(null); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-900/40 text-white hover:bg-red-900/60">🗑️</button>
                )}
                <button onClick={() => setDetailReminder(null)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Status + Priority */}
              <div className="flex gap-2 flex-wrap">
                <span className="px-3 py-1.5 rounded-full text-xs font-bold border"
                  style={{ color: STATUS_CONFIG[detailReminder.status].color, background: STATUS_CONFIG[detailReminder.status].bg, borderColor: STATUS_CONFIG[detailReminder.status].border }}>
                  {STATUS_CONFIG[detailReminder.status].icon} {STATUS_CONFIG[detailReminder.status].label}
                </span>
                <span className="px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{ color: PRIORITY_CONFIG[detailReminder.priority].color, background: PRIORITY_CONFIG[detailReminder.priority].bg }}>
                  {PRIORITY_CONFIG[detailReminder.priority].label}
                </span>
              </div>
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Deadline', `${formatDate(detailReminder.due_date)}${detailReminder.due_time ? ' · ' + detailReminder.due_time : ''}`],
                  ['Handler', detailReminder.assign_name],
                  ['Sales', detailReminder.sales_name || '-'],
                  ['Divisi', detailReminder.sales_division || '-'],
                  ['Product', detailReminder.product || '-'],
                  ['PIC', `${detailReminder.pic_name || '-'}${detailReminder.pic_phone ? ' · ' + detailReminder.pic_phone : ''}`],
                ].map(([label, val]) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-1">{label}</p>
                    <p className="text-sm font-semibold text-slate-800">{val}</p>
                  </div>
                ))}
              </div>
              {detailReminder.address && <div className="bg-slate-50 rounded-xl p-3 border border-slate-100"><p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-1">Lokasi</p><p className="text-sm text-slate-700">{detailReminder.address}</p></div>}
              {detailReminder.description && <div className="bg-slate-50 rounded-xl p-3 border border-slate-100"><p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-1">Deskripsi</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{detailReminder.description}</p></div>}
              {detailReminder.notes && <div className="bg-amber-50 rounded-xl p-3 border border-amber-100"><p className="text-[10px] font-bold tracking-widest uppercase text-amber-500 mb-1">Catatan</p><p className="text-sm text-amber-800 whitespace-pre-wrap">{detailReminder.notes}</p></div>}
              {detailReminder.completion_photo_url && (
                <div>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-2">Foto Bukti</p>
                  <img src={detailReminder.completion_photo_url} alt="Bukti" className="w-full rounded-xl object-cover max-h-48 border border-slate-100" />
                </div>
              )}
              {/* Actions */}
              {detailReminder.status === 'pending' && canAdd && (
                <div className="flex gap-2">
                  <button onClick={() => { handleStatusChange(detailReminder.id, 'done'); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg,#059669,#047857)' }}>✅ Tandai Selesai</button>
                  <button onClick={() => { handleStatusChange(detailReminder.id, 'cancelled'); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50">❌ Batalkan</button>
                </div>
              )}
              {/* Send WA */}
              <button onClick={() => handleSendWA(detailReminder)} disabled={sendingWA === detailReminder.id}
                className="w-full py-2.5 rounded-xl text-sm font-bold border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {sendingWA === detailReminder.id ? <><div className="w-4 h-4 border-2 border-green-300 border-t-green-600 rounded-full animate-spin" />Kirim WA...</> : '📱 Kirim WA Reminder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showFormModal && (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" style={{ border: '2px solid rgba(220,38,38,0.3)' }}>
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
              <h2 className="font-bold text-white text-lg">{editingReminder ? 'Edit Reminder' : '➕ Tambah Reminder'}</h2>
              <button onClick={() => { setShowFormModal(false); setEditingReminder(null); setFormData(emptyForm); }}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Nama Project *</label>
                  <input value={formData.project_name} onChange={e => fd({ project_name: e.target.value })} className={inp} placeholder="Nama project" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Kategori</label>
                  <select value={formData.category} onChange={e => fd({ category: e.target.value })} className={inp}>
                    {CATEGORIES_SVC.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Assign To *</label>
                  <select value={formData.assigned_to} onChange={e => fd({ assigned_to: e.target.value })} className={inp}>
                    <option value="">-- Pilih Team Services --</option>
                    {teamUsers.map(u => <option key={u.username} value={u.username}>{u.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Tanggal *</label>
                  <input type="date" value={formData.due_date} onChange={e => fd({ due_date: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Waktu</label>
                  <input type="time" value={formData.due_time} onChange={e => fd({ due_time: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Prioritas</label>
                  <select value={formData.priority} onChange={e => fd({ priority: e.target.value as Priority })} className={inp}>
                    {(['low','medium','high','urgent'] as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Product</label>
                  <input value={formData.product ?? ''} onChange={e => fd({ product: e.target.value })} className={inp} placeholder="Nama produk" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Sales</label>
                  <input value={formData.sales_name} onChange={e => fd({ sales_name: e.target.value })} className={inp} placeholder="Nama sales" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Divisi Sales</label>
                  <input value={formData.sales_division} onChange={e => fd({ sales_division: e.target.value })} className={inp} placeholder="Divisi" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Lokasi / Alamat</label>
                  <input value={formData.address} onChange={e => fd({ address: e.target.value })} className={inp} placeholder="Alamat/lokasi" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">PIC</label>
                  <input value={formData.pic_name} onChange={e => fd({ pic_name: e.target.value })} className={inp} placeholder="Nama PIC" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">No. PIC</label>
                  <input value={formData.pic_phone} onChange={e => fd({ pic_phone: e.target.value })} className={inp} placeholder="08xx" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Deskripsi</label>
                  <textarea value={formData.description} onChange={e => fd({ description: e.target.value })} className={inp} rows={2} placeholder="Deskripsi pekerjaan" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Catatan</label>
                  <textarea value={formData.notes ?? ''} onChange={e => fd({ notes: e.target.value })} className={inp} rows={2} placeholder="Catatan tambahan" />
                </div>
              </div>
              <button onClick={handleSave} disabled={saving}
                className="w-full text-white py-3 rounded-xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {editingReminder ? '💾 Simpan Perubahan' : '➕ Tambah Reminder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white shadow-md" style={{ borderBottom: '2.5px solid #dc2626' }}>
        <div className="max-w-[1600px] mx-auto px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>⏰</div>
            <div>
              <h1 className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-red-800">Reminder Schedule</h1>
              <p className="text-xs text-slate-400 font-medium">Team Services · Servisindo</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canAdd && (
              <button onClick={() => { setEditingReminder(null); setFormData(emptyForm); setShowFormModal(true); }}
                className="flex items-center gap-1.5 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all hover:scale-105"
                style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)', boxShadow: '0 3px 12px rgba(220,38,38,0.35)' }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                + Tambah
              </button>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs">
              <div className="w-6 h-6 rounded-full text-white flex items-center justify-center font-bold text-[10px]"
                style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                {currentUser?.full_name?.charAt(0)?.toUpperCase()}
              </div>
              <span className="font-semibold text-slate-700 hidden sm:inline">{currentUser?.full_name}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-5 py-5 space-y-5">

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: reminders.length, sub: 'Semua reminder', g: 'linear-gradient(135deg,#4f46e5,#6d28d9)', sh: 'rgba(79,70,229,0.3)' },
            { label: 'Hari Ini', value: todayCount, sub: 'Deadline today', g: 'linear-gradient(135deg,#dc2626,#991b1b)', sh: 'rgba(220,38,38,0.3)' },
            { label: 'Pending', value: pendingCount, sub: 'Belum selesai', g: 'linear-gradient(135deg,#d97706,#b45309)', sh: 'rgba(217,119,6,0.3)' },
            { label: 'Selesai', value: doneCount, sub: 'Completed', g: 'linear-gradient(135deg,#059669,#047857)', sh: 'rgba(5,150,105,0.3)' },
          ].map((c, i) => (
            <div key={i} className="rounded-2xl p-4 flex flex-col gap-2"
              style={{ background: c.g, boxShadow: `0 4px 16px ${c.sh}` }}>
              <span className="text-3xl font-black text-white leading-none mt-2">{c.value}</span>
              <div>
                <p className="text-sm font-bold text-white">{c.label}</p>
                <p className="text-[10px] text-white/70">{c.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Mini Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MiniDonut data={catPieData} title="📂 Kategori" total={catPieData.reduce((s,d)=>s+d.value,0)} />
          <MiniDonut data={handlerPieData} title="👥 Team Services Handler" total={handlerPieData.reduce((s,d)=>s+d.value,0)} />
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[160px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input value={searchProject} onChange={e => setSearchProject(e.target.value)} placeholder="Cari project..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none" />
            </div>
            <input value={searchHandler} onChange={e => setSearchHandler(e.target.value)} placeholder="Filter handler..."
              className="flex-1 min-w-[140px] px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as Status | 'all')}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-red-400 outline-none bg-white cursor-pointer">
              <option value="all">Semua Status</option>
              <option value="pending">⏳ Pending</option>
              <option value="done">✅ Selesai</option>
              <option value="cancelled">❌ Cancelled</option>
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-red-400 outline-none bg-white cursor-pointer">
              <option value="all">Semua Kategori</option>
              {CATEGORIES_SVC.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-red-400 outline-none bg-white cursor-pointer">
              <option value="all">Semua Tahun</option>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {(filterStatus !== 'all' || filterCategory !== 'all' || searchProject || searchHandler) && (
              <button onClick={() => { setFilterStatus('all'); setFilterCategory('all'); setSearchProject(''); setSearchHandler(''); setSearchSales(''); }}
                className="px-3 py-2 rounded-xl text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 transition-all">Reset ✕</button>
            )}
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-slate-400 font-medium">Menampilkan <strong className="text-slate-600">{filteredReminders.length}</strong> dari {reminders.length} reminder</p>
          </div>
        </div>

        {/* Reminder Cards Grid */}
        {listLoading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-red-500 rounded-full animate-spin" />
            <span className="text-slate-500 font-medium">Loading...</span>
          </div>
        ) : filteredReminders.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
            <div className="text-5xl mb-3 opacity-30">⏰</div>
            <p className="text-slate-400 font-medium">Tidak ada reminder ditemukan</p>
            {canAdd && (
              <button onClick={() => { setEditingReminder(null); setFormData(emptyForm); setShowFormModal(true); }}
                className="mt-4 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                + Tambah Reminder Pertama
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredReminders.map(r => (
              <ReminderCard key={r.id} r={r} currentUser={currentUser}
                onDetail={() => setDetailReminder(r)}
                onStatusChange={handleStatusChange} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
