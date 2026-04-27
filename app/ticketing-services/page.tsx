'use client';

// ══════════════════════════════════════════════════════════════════════════════
// TICKETING SERVICES — Platform Team Services (Servisindo)
// Membaca tickets dari Supabase PTS (filter current_team = 'Team Services')
// Update services_status ke kedua DB (PTS + Services)
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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

// ── WA via Services Supabase Edge Function ────────────────────────────────────
async function sendWA(body: Record<string, unknown>) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    await fetch(`${url}/functions/v1/swift-responder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key },
      body: JSON.stringify(body),
    });
  } catch (e) { console.warn('[WA]', e); }
}

// ── Workflow Status Team Services (urutan proses) ────────────────────────────
// Verifying Warranty → Analyzing → Void → RMA Submitted →
// Waiting Part → In Repair → Backup Deployed → Repaired Unit → Solved
const SERVICES_STATUSES = [
  'Waiting Approval',
  'Verifying Warranty',
  'Analyzing',
  'Void',
  'RMA Submitted',
  'Waiting Part',
  'In Repair',
  'Backup Deployed',
  'Repaired Unit',
  'Solved',
] as const;
type ServicesStatus = typeof SERVICES_STATUSES[number];

// Urutan workflow untuk progress indicator
const WORKFLOW_ORDER: ServicesStatus[] = [
  'Verifying Warranty', 'Analyzing', 'Void', 'RMA Submitted',
  'Waiting Part', 'In Repair', 'Backup Deployed', 'Repaired Unit', 'Solved',
];

// Status yang trigger auto-create reminder di Reminder Schedule
const STATUS_TRIGGERS_REMINDER: ServicesStatus[] = ['In Repair'];

const STATUS_COLORS: Record<string, string> = {
  'Waiting Approval':   'bg-orange-50 text-orange-600 border-orange-200',
  'Verifying Warranty': 'bg-sky-50 text-sky-700 border-sky-200',
  'Analyzing':          'bg-purple-50 text-purple-700 border-purple-200',
  'Void':               'bg-slate-50 text-slate-600 border-slate-300',
  'RMA Submitted':      'bg-amber-50 text-amber-700 border-amber-200',
  'Waiting Part':       'bg-rose-50 text-rose-700 border-rose-200',
  'In Repair':          'bg-blue-50 text-blue-700 border-blue-300',
  'Backup Deployed':    'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Repaired Unit':      'bg-teal-50 text-teal-700 border-teal-200',
  'Solved':             'bg-emerald-50 text-emerald-600 border-emerald-200',
};

const STATUS_GRADIENTS: Record<string, { gradient: string; shadow: string }> = {
  'Waiting Approval':   { gradient: 'linear-gradient(135deg,#ea580c,#c2410c)', shadow: 'rgba(234,88,12,0.3)' },
  'Verifying Warranty': { gradient: 'linear-gradient(135deg,#0284c7,#0369a1)', shadow: 'rgba(2,132,199,0.3)' },
  'Analyzing':          { gradient: 'linear-gradient(135deg,#7c3aed,#6d28d9)', shadow: 'rgba(124,58,237,0.3)' },
  'Void':               { gradient: 'linear-gradient(135deg,#64748b,#475569)', shadow: 'rgba(100,116,139,0.3)' },
  'RMA Submitted':      { gradient: 'linear-gradient(135deg,#d97706,#b45309)', shadow: 'rgba(217,119,6,0.3)' },
  'Waiting Part':       { gradient: 'linear-gradient(135deg,#e11d48,#9f1239)', shadow: 'rgba(225,29,72,0.3)' },
  'In Repair':          { gradient: 'linear-gradient(135deg,#2563eb,#1d4ed8)', shadow: 'rgba(37,99,235,0.3)' },
  'Backup Deployed':    { gradient: 'linear-gradient(135deg,#4f46e5,#4338ca)', shadow: 'rgba(79,70,229,0.3)' },
  'Repaired Unit':      { gradient: 'linear-gradient(135deg,#0d9488,#0f766e)', shadow: 'rgba(13,148,136,0.3)' },
  'Solved':             { gradient: 'linear-gradient(135deg,#059669,#047857)', shadow: 'rgba(5,150,105,0.3)' },
};

interface User {
  id: string;
  username: string;
  password: string;
  full_name: string;
  role: string;
  phone_number?: string;
}

interface Ticket {
  id: string;
  project_name: string;
  address?: string;
  customer_phone?: string;
  sales_name: string;
  sales_division?: string;
  issue_case: string;
  description: string;
  sn_unit?: string;
  product?: string;
  assign_name: string;
  status: string;
  services_status?: string;
  current_team?: string;
  date: string;
  created_at: string;
  created_by?: string;
  photo_url?: string;
  photo_name?: string;
}

interface ActivityLog {
  id: string;
  ticket_id?: string;
  handler_name: string;
  handler_username: string;
  action_taken: string;
  notes: string;
  new_status: string;
  team_type: string;
  created_at: string;
  file_url?: string;
  file_name?: string;
}

// ── Helper ────────────────────────────────────────────────────────────────────
function formatDateTime(s: string) {
  if (!s) return '-';
  const d = new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z');
  if (isNaN(d.getTime())) return s;
  const jkt = new Date(d.getTime() + 7 * 3600000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(jkt.getUTCDate())}/${pad(jkt.getUTCMonth()+1)}/${jkt.getUTCFullYear()}, ${pad(jkt.getUTCHours())}:${pad(jkt.getUTCMinutes())}`;
}

// ── Donut Chart (Services Status) ─────────────────────────────────────────────
function StatusDonutCard({ data, total, onSliceClick }: { data: { name: string; value: number; color: string }[]; total: number; onSliceClick: (name: string) => void }) {
  const [hov, setHov] = useState<number | null>(null);
  if (total === 0) return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)' }}>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">📊 Status</p>
      <p className="text-slate-400 text-sm text-center py-4">Belum ada data</p>
    </div>
  );
  let cum = -Math.PI / 2;
  const cx = 60, cy = 60, r = 50, ir = 28;
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
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)' }}>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">📊 Services Status</p>
      <div className="flex items-center gap-3">
        <svg width="120" height="120" viewBox="0 0 120 120" className="flex-shrink-0">
          {slices.map(s => s.isCircle
            ? <g key={s.i} onClick={() => onSliceClick(s.name)} style={{ cursor: 'pointer' }}>
                <circle cx={cx} cy={cy} r={r} fill={s.color} opacity={hov === null || hov === s.i ? 1 : 0.45} />
                <circle cx={cx} cy={cy} r={ir} fill="white" />
              </g>
            : <path key={s.i} d={s.path} fill={s.color} opacity={hov === null || hov === s.i ? 1 : 0.45}
                style={{ cursor: 'pointer', transition: 'opacity 0.15s', filter: hov === s.i ? `drop-shadow(0 0 4px ${s.color})` : 'none' }}
                onMouseEnter={() => setHov(s.i)} onMouseLeave={() => setHov(null)} onClick={() => onSliceClick(s.name)} />
          )}
          <text x="60" y="57" textAnchor="middle" fontSize="16" fontWeight="800" fill="#1e293b">{total}</text>
          <text x="60" y="70" textAnchor="middle" fontSize="7" fill="#94a3b8" fontWeight="600">TOTAL</text>
        </svg>
        <div className="flex flex-col gap-1.5 flex-1 min-w-0 max-h-[120px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {slices.map(s => (
            <div key={s.i} className="flex items-center gap-1.5 cursor-pointer rounded-lg px-1.5 py-0.5 transition-all"
              style={{ background: hov === s.i ? `${s.color}18` : 'transparent' }}
              onMouseEnter={() => setHov(s.i)} onMouseLeave={() => setHov(null)} onClick={() => onSliceClick(s.name)}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="text-[10px] font-semibold text-slate-600 truncate flex-1">{s.name}</span>
              <span className="text-[10px] font-bold" style={{ color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Handler Donut (Team Services only) ────────────────────────────────────────
function HandlerDonutCard({ data, total, onSliceClick, activeHandler }: { data: { name: string; value: number; color: string }[]; total: number; onSliceClick: (n: string) => void; activeHandler: string | null }) {
  const [hov, setHov] = useState<number | null>(null);
  if (total === 0) return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)' }}>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">👥 Handler</p>
      <p className="text-slate-400 text-sm text-center py-4">Belum ada data</p>
    </div>
  );
  let cum = -Math.PI / 2;
  const cx = 60, cy = 60, r = 50, ir = 28;
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
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)' }}>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">👥 Team Services Handler</p>
      <div className="flex items-center gap-3">
        <svg width="120" height="120" viewBox="0 0 120 120" className="flex-shrink-0">
          {slices.map(s => s.isCircle
            ? <g key={s.i} onClick={() => onSliceClick(s.name)} style={{ cursor: 'pointer' }}>
                <circle cx={cx} cy={cy} r={r} fill={s.color} opacity={hov === null || hov === s.i ? 1 : 0.45} />
                <circle cx={cx} cy={cy} r={ir} fill="white" />
              </g>
            : <path key={s.i} d={s.path} fill={s.color} opacity={hov === null || hov === s.i ? 1 : 0.45}
                style={{ cursor: 'pointer', transition: 'opacity 0.15s', filter: hov === s.i || activeHandler === s.name ? `drop-shadow(0 0 4px ${s.color})` : 'none' }}
                onMouseEnter={() => setHov(s.i)} onMouseLeave={() => setHov(null)} onClick={() => onSliceClick(s.name)} />
          )}
          <text x="60" y="57" textAnchor="middle" fontSize="16" fontWeight="800" fill="#1e293b">{total}</text>
          <text x="60" y="70" textAnchor="middle" fontSize="7" fill="#94a3b8" fontWeight="600">TOTAL</text>
        </svg>
        <div className="flex flex-col gap-1.5 flex-1 min-w-0 max-h-[120px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {slices.map(s => (
            <div key={s.i} className="flex items-center gap-1.5 cursor-pointer rounded-lg px-1.5 py-0.5 transition-all"
              style={{ background: hov === s.i || activeHandler === s.name ? `${s.color}20` : 'transparent', outline: activeHandler === s.name ? `1px solid ${s.color}` : 'none' }}
              onMouseEnter={() => setHov(s.i)} onMouseLeave={() => setHov(null)} onClick={() => onSliceClick(s.name)}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="text-[10px] font-semibold text-slate-600 truncate flex-1">{s.name}</span>
              <span className="text-[10px] font-bold" style={{ color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function TicketingServices() {
  const [initializing, setInitializing] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);

  const [searchProject, setSearchProject] = useState('');
  const [searchSales, setSearchSales] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterYear, setFilterYear] = useState('all');
  const [handlerFilter, setHandlerFilter] = useState<string | null>(null);

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [newActivity, setNewActivity] = useState({
    action_taken: '',
    notes: '',
    new_status: 'Verifying Warranty' as ServicesStatus,
    file: null as File | null,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalTicket, setApprovalTicket] = useState<Ticket | null>(null);

  const [loadingMsg, setLoadingMsg] = useState('');
  const [showLoadingPopup, setShowLoadingPopup] = useState(false);

  const ticketListRef = useRef<HTMLDivElement>(null);

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
          const user = JSON.parse(saved) as User;
          setCurrentUser(user);
          setIsLoggedIn(true);
          fetchData(user);
        } catch { /* ignore */ }
      }
    }
    setInitializing(false);
  }, []);

  // ── Session timeout ──────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const t = localStorage.getItem('svc_loginTime');
      if (t && Date.now() - parseInt(t) > 6 * 60 * 60 * 1000) {
        localStorage.removeItem('svc_currentUser');
        localStorage.removeItem('svc_loginTime');
        setIsLoggedIn(false); setCurrentUser(null);
      }
    };
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, []);

  // ── Fetch tickets from PTS DB (Team Services view) ───────────────────────
  const fetchData = useCallback(async (user?: User | null) => {
    setTicketsLoading(true);
    try {
      // Tickets: filter current_team = 'Team Services' OR services_status not null
      const { data: ticketData } = await getSupabasePTS().from('tickets')
        .select('*')
        .or('current_team.eq.Team Services,services_status.not.is.null')
        .order('created_at', { ascending: false });
      setTickets((ticketData ?? []) as Ticket[]);
    } catch (e) { console.error('[fetchData tickets]', e); }

    // Team members dari Services DB
    try {
      const { data: members } = await getSupabase().from('users').select('*').order('full_name');
      setTeamMembers((members ?? []) as User[]);
    } catch { /* ignore */ }

    setTimeout(() => setTicketsLoading(false), 300);
  }, []);

  // ── Realtime subscription (PTS tickets) ─────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    const ch = getSupabasePTS().channel('svc-tickets-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        setTimeout(() => fetchData(currentUser), 500);
      })
      .subscribe();
    return () => { getSupabasePTS().removeChannel(ch); };
  }, [isLoggedIn, currentUser, fetchData]);

  // ── Login ────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!loginForm.username || !loginForm.password) { setLoginError('Wajib diisi!'); return; }
    setLoginLoading(true); setLoginError('');
    try {
      const { data, error } = await getSupabase().from('users').select('*')
        .eq('username', loginForm.username).eq('password', loginForm.password).single();
      if (error || !data) { setLoginError('Username atau password salah!'); setLoginLoading(false); return; }
      const user = data as User;
      setCurrentUser(user); setIsLoggedIn(true);
      localStorage.setItem('svc_currentUser', JSON.stringify(user));
      localStorage.setItem('svc_loginTime', Date.now().toString());
      fetchData(user);
    } catch { setLoginError('Login gagal.'); }
    setLoginLoading(false);
  };

  // ── Fetch activity logs ──────────────────────────────────────────────────
  const fetchLogs = async (ticketId: string) => {
    setLogsLoading(true);
    // Prioritize logs from PTS DB (source of truth), fallback to Services DB
    try {
      const { data } = await getSupabasePTS().from('activity_logs')
        .select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
      setActivityLogs((data ?? []) as ActivityLog[]);
    } catch {
      const { data } = await getSupabase().from('activity_logs')
        .select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
      setActivityLogs((data ?? []) as ActivityLog[]);
    }
    setLogsLoading(false);
  };

  const openTicket = async (t: Ticket) => {
    setSelectedTicket(t);
    setShowDetail(true);
    await fetchLogs(t.id);
  };

  // ── Approve ticket (Waiting Approval → Pending) ──────────────────────────
  const handleApprove = async (ticket: Ticket) => {
    setShowLoadingPopup(true);
    setLoadingMsg('Menyetujui ticket...');
    try {
      await getSupabasePTS().from('tickets').update({ services_status: 'Pending' }).eq('id', ticket.id);
      await getSupabasePTS().from('activity_logs').insert([{
        ticket_id: ticket.id,
        handler_name: currentUser?.full_name ?? '',
        handler_username: currentUser?.username ?? '',
        action_taken: 'Ticket disetujui oleh Team Services',
        notes: '',
        new_status: 'Pending',
        team_type: 'Team Services',
        created_at: new Date().toISOString(),
      }]);
      await fetchData(currentUser);
      setShowApprovalModal(false);
      setApprovalTicket(null);
      if (selectedTicket?.id === ticket.id) {
        setSelectedTicket(t => t ? { ...t, services_status: 'Pending' } : t);
        await fetchLogs(ticket.id);
      }
    } catch (e: any) { alert('Gagal approve: ' + e.message); }
    setLoadingMsg('✅ Ticket disetujui!');
    setTimeout(() => setShowLoadingPopup(false), 1200);
  };

  // ── State tambahan untuk In Repair auto-reminder ──────────────────────────
  const [showRepairSchedule, setShowRepairSchedule] = useState(false);
  const [repairSchedule, setRepairSchedule] = useState({
    due_date: new Date(Date.now() + 7 * 24 * 3600000).toISOString().split('T')[0],
    due_time: '09:00',
    notes: '',
  });

  // ── Update activity (update services_status di PTS DB + auto-reminder) ───
  const handleUpdateActivity = async () => {
    if (!selectedTicket) return;
    if (!newActivity.action_taken.trim()) { alert('Action taken wajib diisi!'); return; }

    // Validasi: jika In Repair, wajib isi jadwal estimasi selesai
    const isInRepair = newActivity.new_status === 'In Repair';
    if (isInRepair && !repairSchedule.due_date) {
      alert('Untuk status In Repair, wajib isi estimasi tanggal selesai perbaikan!');
      return;
    }

    setSaving(true);
    setShowLoadingPopup(true);
    setLoadingMsg('Menyimpan update...');

    let fileUrl = '';
    let fileName = '';
    if (newActivity.file) {
      setLoadingMsg('Upload file...');
      const ext = newActivity.file.name.split('.').pop();
      const path = `svc-activity/${selectedTicket.id}-${Date.now()}.${ext}`;
      try {
        // Upload ke Services DB storage
        const { error: upErr } = await getSupabase().storage.from('ticket-files').upload(path, newActivity.file);
        if (!upErr) {
          const { data: urlData } = getSupabase().storage.from('ticket-files').getPublicUrl(path);
          fileUrl = urlData.publicUrl ?? '';
          fileName = newActivity.file.name;
        }
      } catch { /* fallback: no file url */ }
    }

    const logBase = {
      handler_name:     currentUser?.full_name ?? '',
      handler_username: currentUser?.username ?? '',
      action_taken:     newActivity.action_taken,
      notes:            newActivity.notes,
      new_status:       newActivity.new_status,
      team_type:        'Team Services',
      file_url:         fileUrl,
      file_name:        fileName,
      assigned_to_services: false,
      created_at:       new Date().toISOString(),
    };

    try {
      // 1) Insert log ke PTS DB (cross-reference)
      await getSupabasePTS().from('activity_logs').insert([{
        ...logBase,
        ticket_id: selectedTicket.id,
        pts_ticket_id: selectedTicket.id,
      }]);

      // 2) Insert log ke Services DB (lokal)
      await getSupabase().from('activity_logs').insert([{
        ...logBase,
        ticket_id: selectedTicket.id,
        pts_ticket_id: selectedTicket.id,
      }]);

      // 3) Update services_status di PTS DB
      await getSupabasePTS().from('tickets').update({
        services_status: newActivity.new_status,
        ...(newActivity.new_status === 'Solved' ? { current_team: 'Team Services' } : {}),
      }).eq('id', selectedTicket.id);

      // 4) Update/insert di Services DB (mirror)
      const { data: existSvc } = await getSupabase().from('tickets').select('id').eq('pts_ticket_id', selectedTicket.id).maybeSingle();
      if (existSvc) {
        await getSupabase().from('tickets').update({
          services_status: newActivity.new_status,
        }).eq('pts_ticket_id', selectedTicket.id);
      } else {
        // Buat mirror ticket jika belum ada
        await getSupabase().from('tickets').insert([{
          pts_ticket_id:  selectedTicket.id,
          project_name:   selectedTicket.project_name,
          address:        selectedTicket.address ?? null,
          customer_phone: selectedTicket.customer_phone ?? null,
          sales_name:     selectedTicket.sales_name ?? null,
          sales_division: selectedTicket.sales_division ?? null,
          sn_unit:        selectedTicket.sn_unit ?? null,
          product:        selectedTicket.product ?? null,
          issue_case:     selectedTicket.issue_case,
          description:    selectedTicket.description ?? null,
          assign_name:    selectedTicket.assign_name,
          services_status: newActivity.new_status,
          current_team:   'Team Services',
          created_at:     selectedTicket.created_at,
        }]);
      }

      // ── 5) AUTO-CREATE REMINDER saat status → In Repair ──────────────────
      if (isInRepair) {
        setLoadingMsg('Membuat Reminder Schedule otomatis...');
        try {
          const reminderPayload = {
            project_name: selectedTicket.project_name,
            description:  `[AUTO dari Ticketing] ${selectedTicket.issue_case}${selectedTicket.product ? ` | Product: ${selectedTicket.product}` : ''}`,
            assigned_to:  currentUser?.username ?? '',
            assign_name:  currentUser?.full_name ?? '',
            due_date:     repairSchedule.due_date,
            due_time:     repairSchedule.due_time,
            priority:     'high',
            status:       'pending',
            category:     'Perbaikan Unit',
            sales_name:   selectedTicket.sales_name ?? '',
            sales_division: selectedTicket.sales_division ?? '',
            address:      selectedTicket.address ?? '',
            product:      selectedTicket.product ?? selectedTicket.sn_unit ?? '',
            pic_name:     selectedTicket.customer_phone ?? '',
            notes:        repairSchedule.notes
              ? `${repairSchedule.notes} | Ticket ID: ${selectedTicket.id}`
              : `Dibuat otomatis saat ticket masuk In Repair. Ticket ID: ${selectedTicket.id}`,
            source_ticket_id:     selectedTicket.id,
            source_pts_ticket_id: selectedTicket.id,
            created_by: currentUser?.username ?? 'system',
          };

          const { error: reminderErr } = await getSupabase().from('reminders').insert([reminderPayload]);
          if (reminderErr) {
            console.warn('[Auto Reminder] Gagal:', reminderErr.message);
          } else {
            console.log('[Auto Reminder] ✅ Reminder Perbaikan Unit otomatis dibuat');

            // ── Kirim WA notifikasi ke handler tentang jadwal perbaikan ────
            if (currentUser?.phone_number) {
              const dueDateFormatted = new Date(repairSchedule.due_date + 'T00:00:00')
                .toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
              await sendWA({
                type: 'repair_schedule',
                target: currentUser.phone_number,
                message: [
                  `🔧 *JADWAL PERBAIKAN — Servisindo*`,
                  `━━━━━━━━━━━━━━━━━━`,
                  `Halo *${currentUser.full_name}*, kamu mendapat jadwal perbaikan unit:`,
                  ``,
                  `📌 *${selectedTicket.project_name}*`,
                  `🔩 Issue: ${selectedTicket.issue_case}`,
                  selectedTicket.product ? `📦 Product: ${selectedTicket.product}` : null,
                  selectedTicket.sn_unit ? `🔢 SN: ${selectedTicket.sn_unit}` : null,
                  `🕐 Est. Selesai: *${dueDateFormatted} · ${repairSchedule.due_time}*`,
                  repairSchedule.notes ? `📝 Catatan: ${repairSchedule.notes}` : null,
                  ``,
                  `━━━━━━━━━━━━━━━━━━`,
                  `Semangat! 💪 — _Servisindo Work Management_`,
                ].filter(Boolean).join('\n'),
              });
            }
          }
        } catch (reminderEx) {
          console.warn('[Auto Reminder] Exception:', reminderEx);
        }
      }
      // ────────────────────────────────────────────────────────────────────

      // ── 6) WA notif ke customer jika Solved ───────────────────────────────
      if (newActivity.new_status === 'Solved' && selectedTicket.customer_phone) {
        await sendWA({
          type: 'services_solved',
          target: selectedTicket.customer_phone,
          message: [
            `✅ *UNIT SELESAI DIPERBAIKI — Servisindo*`,
            `━━━━━━━━━━━━━━━━━━`,
            `Unit *${selectedTicket.project_name}* telah selesai diperbaiki oleh Team Services Servisindo.`,
            selectedTicket.product ? `📦 Product: ${selectedTicket.product}` : null,
            selectedTicket.sn_unit ? `🔢 SN: ${selectedTicket.sn_unit}` : null,
            ``,
            `Silakan koordinasi untuk pengambilan/pengembalian unit.`,
            ``,
            `Terima kasih telah mempercayakan service kepada *Servisindo Multimedia Service Center*! 🙏`,
          ].filter(Boolean).join('\n'),
        });
      }

      setSelectedTicket(t => t ? { ...t, services_status: newActivity.new_status } : t);
      await fetchData(currentUser);
      await fetchLogs(selectedTicket.id);

      setNewActivity({ action_taken: '', notes: '', new_status: 'Verifying Warranty', file: null });
      setShowRepairSchedule(false);
      setRepairSchedule({ due_date: new Date(Date.now() + 7 * 24 * 3600000).toISOString().split('T')[0], due_time: '09:00', notes: '' });
      setShowUpdateForm(false);
      setLoadingMsg('✅ Update berhasil!');

    } catch (e: any) {
      alert('Gagal update: ' + e.message);
      setShowLoadingPopup(false);
    }

    setSaving(false);
    setTimeout(() => setShowLoadingPopup(false), 1600);
  };

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const svcTickets = tickets.filter(t => t.services_status || t.current_team === 'Team Services');
    const counts: Record<string, number> = {};
    SERVICES_STATUSES.forEach(s => { counts[s] = svcTickets.filter(t => t.services_status === s).length; });
    const total = svcTickets.length;
    const active = svcTickets.filter(t => t.services_status !== 'Solved').length;
    const solved = counts['Solved'] ?? 0;
    const waiting = counts['Waiting Approval'] ?? 0;

    const statusData = SERVICES_STATUSES
      .map((s, i) => ({
        name: s, value: counts[s] ?? 0,
        color: ['#f97316','#fcd34d','#4ade80','#f87171','#fb923c','#f59e0b','#fda4af','#60a5fa','#34d399'][i],
      }))
      .filter(d => d.value > 0);

    const handlerCounts: Record<string, number> = {};
    svcTickets.forEach(t => { if (t.assign_name) handlerCounts[t.assign_name] = (handlerCounts[t.assign_name] ?? 0) + 1; });
    const handlerColors = ['#dc2626','#2563eb','#059669','#d97706','#7c3aed','#0891b2','#db2777','#65a30d'];
    const handlerData = Object.entries(handlerCounts).map(([name, value], i) => ({ name, value, color: handlerColors[i % handlerColors.length] }));

    return { total, active, solved, waiting, statusData, handlerData };
  }, [tickets]);

  // ── Filtered tickets ─────────────────────────────────────────────────────
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const svcOnly = t.services_status || t.current_team === 'Team Services';
      if (!svcOnly) return false;
      const matchProject = (t.project_name ?? '').toLowerCase().includes(searchProject.toLowerCase()) || (t.issue_case ?? '').toLowerCase().includes(searchProject.toLowerCase());
      const matchSales = (t.sales_name ?? '').toLowerCase().includes(searchSales.toLowerCase());
      const year = t.created_at ? new Date(t.created_at).getFullYear().toString() : '';
      const matchYear = filterYear === 'all' || year === filterYear;
      let matchStatus = false;
      if (filterStatus === 'All') matchStatus = true;
      else matchStatus = t.services_status === filterStatus;
      const matchHandler = handlerFilter === null || t.assign_name === handlerFilter;
      return matchProject && matchSales && matchYear && matchStatus && matchHandler;
    });
  }, [tickets, searchProject, searchSales, filterYear, filterStatus, handlerFilter]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    tickets.forEach(t => { if (t.created_at) years.add(new Date(t.created_at).getFullYear().toString()); });
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [tickets]);

  const pendingApprovalCount = useMemo(() => tickets.filter(t => t.services_status === 'Waiting Approval').length, [tickets]);

  // ── Loading / Login ──────────────────────────────────────────────────────
  if (initializing) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="w-10 h-10 border-4 border-slate-200 border-t-red-600 rounded-full animate-spin" /></div>;

  if (!isLoggedIn) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg,#0f172a,#1a0505)', backgroundImage: 'url(/SVC_Background.png)', backgroundSize: 'cover', backgroundBlendMode: 'overlay' }}>
      <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-8 w-full max-w-md" style={{ border: '1.5px solid rgba(220,38,38,0.25)' }}>
        <div className="flex justify-center mb-5">
          <div className="bg-black rounded-2xl px-6 py-3 shadow-lg">
            <img src="/logo-servisindo.png" alt="Servisindo" style={{ height: '40px', width: 'auto' }} />
          </div>
        </div>
        <h1 className="text-xl font-black text-center text-slate-800 mb-1">Ticket Troubleshooting</h1>
        <p className="text-center text-slate-400 text-sm mb-6">Team Services · Servisindo</p>
        {loginError && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm font-semibold text-red-700">❌ {loginError}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-2 text-slate-500 tracking-widest uppercase">Username</label>
            <input type="text" value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 focus:ring-4 focus:ring-red-100 transition-all font-medium bg-white text-sm"
              onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <div>
            <label className="block text-xs font-bold mb-2 text-slate-500 tracking-widest uppercase">Password</label>
            <input type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 focus:ring-4 focus:ring-red-100 transition-all font-medium bg-white text-sm"
              onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <button onClick={handleLogin} disabled={loginLoading}
            className="w-full text-white py-3.5 rounded-xl font-bold shadow-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
            {loginLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</> : '🔐 Sign In'}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Main UI ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundImage: 'url(/SVC_Background.png)', backgroundSize: 'cover', backgroundAttachment: 'fixed' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* Loading popup */}
        {showLoadingPopup && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000]">
            <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4" style={{ border: '2px solid rgba(220,38,38,0.3)' }}>
              <div className="flex flex-col items-center">
                {loadingMsg.includes('✅')
                  ? <div className="text-5xl mb-4 animate-bounce">✅</div>
                  : <div className="relative w-14 h-14 mb-4"><div className="absolute inset-0 rounded-full border-4 border-slate-200" /><div className="absolute inset-0 rounded-full border-4 border-red-600 border-t-transparent animate-spin" /></div>
                }
                <p className="text-lg font-bold text-slate-800 text-center">{loadingMsg}</p>
              </div>
            </div>
          </div>
        )}

        {/* Ticket Detail Side Panel */}
        {showDetail && selectedTicket && (
          <div className="fixed inset-0 z-[9000] flex">
            <div className="flex-1 bg-black/40" onClick={() => { setShowDetail(false); setShowUpdateForm(false); }} />
            <div className="w-full max-w-xl bg-white flex flex-col overflow-hidden shadow-2xl" style={{ borderLeft: '3px solid #dc2626' }}>
              {/* Panel header */}
              <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                <div>
                  <h3 className="font-black text-base text-white truncate max-w-[280px]">{selectedTicket.project_name}</h3>
                  <p className="text-white/70 text-xs mt-0.5">{selectedTicket.issue_case}</p>
                </div>
                <div className="flex items-center gap-2">
                  {(currentUser?.role === 'admin' || currentUser?.role === 'team') && selectedTicket.services_status !== 'Solved' && (
                    <button onClick={() => setShowUpdateForm(v => !v)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/20 text-white hover:bg-white/30 transition-all">
                      {showUpdateForm ? 'Tutup' : '✍️ Update'}
                    </button>
                  )}
                  <button onClick={() => { setShowDetail(false); setShowUpdateForm(false); }}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Update Form */}
                {showUpdateForm && (
                  <div className="p-5 border-b border-slate-100 bg-red-50/30">
                    <h4 className="font-bold text-slate-800 text-sm mb-3">Update Status Services</h4>

                    {/* Workflow Progress */}
                    <div className="mb-4 overflow-x-auto pb-1">
                      <div className="flex items-center gap-0 min-w-max">
                        {WORKFLOW_ORDER.map((s, i) => {
                          const currentIdx = WORKFLOW_ORDER.indexOf((selectedTicket.services_status ?? 'Verifying Warranty') as ServicesStatus);
                          const isPast = i < currentIdx;
                          const isCurrent = i === currentIdx;
                          const isFuture = i > currentIdx;
                          const dotColor = isPast ? '#10b981' : isCurrent ? '#dc2626' : '#cbd5e1';
                          return (
                            <div key={s} className="flex items-center">
                              <div className="flex flex-col items-center gap-1">
                                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                                  style={{ background: dotColor, boxShadow: isCurrent ? `0 0 0 3px ${dotColor}30` : 'none' }}>
                                  {isPast ? '✓' : i + 1}
                                </div>
                                <span className="text-[8px] font-semibold text-center leading-tight max-w-[52px]"
                                  style={{ color: isCurrent ? '#dc2626' : isPast ? '#10b981' : '#94a3b8' }}>
                                  {s.replace('Verifying ', 'Ver. ').replace('Submitted', 'Sub.').replace('Deployed', 'Dep.')}
                                </span>
                              </div>
                              {i < WORKFLOW_ORDER.length - 1 && (
                                <div className="w-4 h-0.5 mb-3 flex-shrink-0"
                                  style={{ background: isPast ? '#10b981' : '#e2e8f0' }} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Status Baru</label>
                        <select value={newActivity.new_status}
                          onChange={e => {
                            const s = e.target.value as ServicesStatus;
                            setNewActivity({ ...newActivity, new_status: s });
                            setShowRepairSchedule(s === 'In Repair');
                          }}
                          className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-500 outline-none bg-white font-semibold">
                          {SERVICES_STATUSES.map(s => (
                            <option key={s} value={s}>
                              {s === 'In Repair' ? '🔧 ' : s === 'Solved' ? '✅ ' : s === 'Waiting Approval' ? '⏳ ' : ''}
                              {s}
                              {s === 'In Repair' ? ' → Auto Reminder' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* IN REPAIR: Estimasi jadwal selesai */}
                      {showRepairSchedule && (
                        <div className="bg-blue-50 rounded-xl p-3 border border-blue-200 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600 text-base">🔧</span>
                            <div>
                              <p className="text-xs font-bold text-blue-700">In Repair — Auto Reminder</p>
                              <p className="text-[10px] text-blue-500">Isi estimasi selesai perbaikan. Reminder + WA otomatis dibuat.</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold mb-1 text-blue-600 tracking-widest uppercase">Est. Selesai *</label>
                              <input type="date" value={repairSchedule.due_date}
                                onChange={e => setRepairSchedule({ ...repairSchedule, due_date: e.target.value })}
                                className="w-full border border-blue-300 rounded-lg px-2.5 py-2 text-sm focus:border-blue-500 outline-none bg-white" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold mb-1 text-blue-600 tracking-widest uppercase">Jam</label>
                              <input type="time" value={repairSchedule.due_time}
                                onChange={e => setRepairSchedule({ ...repairSchedule, due_time: e.target.value })}
                                className="w-full border border-blue-300 rounded-lg px-2.5 py-2 text-sm focus:border-blue-500 outline-none bg-white" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold mb-1 text-blue-600 tracking-widest uppercase">Catatan Perbaikan</label>
                            <input value={repairSchedule.notes}
                              onChange={e => setRepairSchedule({ ...repairSchedule, notes: e.target.value })}
                              className="w-full border border-blue-300 rounded-lg px-2.5 py-2 text-sm focus:border-blue-500 outline-none"
                              placeholder="Misal: Ganti mainboard, tunggu part dari vendor..." />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Action Taken *</label>
                        <input value={newActivity.action_taken} onChange={e => setNewActivity({ ...newActivity, action_taken: e.target.value })}
                          className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-500 outline-none"
                          placeholder="Apa yang sudah dilakukan..." />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Catatan</label>
                        <textarea value={newActivity.notes} onChange={e => setNewActivity({ ...newActivity, notes: e.target.value })}
                          className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-500 outline-none resize-none" rows={2}
                          placeholder="Catatan tambahan..." />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Lampiran</label>
                        <input type="file" onChange={e => setNewActivity({ ...newActivity, file: e.target.files?.[0] ?? null })}
                          className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-red-50 file:text-red-700 hover:file:bg-red-100" />
                      </div>
                      <button onClick={handleUpdateActivity} disabled={saving}
                        className="w-full text-white py-3 rounded-xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
                        style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                        {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {newActivity.new_status === 'In Repair' ? '🔧 Update + Buat Reminder' : 'Simpan Update'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Ticket Info */}
                <div className="p-5 space-y-4">
                  {/* Status badges */}
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${STATUS_COLORS[selectedTicket.status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      PTS: {selectedTicket.status}
                    </span>
                    {selectedTicket.services_status && (
                      <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${STATUS_COLORS[selectedTicket.services_status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        SVC: {selectedTicket.services_status}
                      </span>
                    )}
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['Sales', selectedTicket.sales_name],
                      ['Divisi', selectedTicket.sales_division ?? '-'],
                      ['Handler', selectedTicket.assign_name],
                      ['Product', selectedTicket.product ?? '-'],
                      ['SN Unit', selectedTicket.sn_unit ?? '-'],
                      ['Tgl Masuk', formatDateTime(selectedTicket.created_at)],
                    ].map(([label, val]) => (
                      <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-1">{label}</p>
                        <p className="text-sm font-semibold text-slate-800 break-words">{val}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-1">Deskripsi</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedTicket.description || '-'}</p>
                  </div>

                  {selectedTicket.address && (
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-1">Lokasi</p>
                      <p className="text-sm text-slate-700">{selectedTicket.address}</p>
                    </div>
                  )}

                  {/* Activity Logs */}
                  <div>
                    <p className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-3">📋 Activity Log</p>
                    {logsLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <div className="w-6 h-6 border-3 border-slate-200 border-t-red-500 rounded-full animate-spin" />
                      </div>
                    ) : activityLogs.length === 0 ? (
                      <p className="text-slate-400 text-sm text-center py-4">Belum ada activity log</p>
                    ) : (
                      <div className="space-y-3">
                        {activityLogs.map(log => {
                          const isSvc = log.team_type === 'Team Services';
                          return (
                            <div key={log.id} className="rounded-xl p-3 border" style={{
                              background: isSvc ? 'rgba(220,38,38,0.04)' : 'rgba(37,99,235,0.04)',
                              borderColor: isSvc ? 'rgba(220,38,38,0.15)' : 'rgba(37,99,235,0.15)',
                            }}>
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <span className="text-xs font-bold" style={{ color: isSvc ? '#dc2626' : '#2563eb' }}>
                                  {log.handler_name} · {log.team_type === 'Team Services' ? '🔧 Services' : '🏗️ PTS'}
                                </span>
                                <span className="text-[10px] text-slate-400 flex-shrink-0">{formatDateTime(log.created_at)}</span>
                              </div>
                              <p className="text-sm font-semibold text-slate-800">{log.action_taken}</p>
                              {log.notes && <p className="text-xs text-slate-500 mt-1">{log.notes}</p>}
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[log.new_status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                  → {log.new_status}
                                </span>
                                {log.file_url && (
                                  <a href={log.file_url} target="_blank" rel="noopener noreferrer"
                                    className="text-[10px] font-semibold text-blue-600 hover:underline">📎 {log.file_name || 'File'}</a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Approval Modal */}
        {showApprovalModal && approvalTicket && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9500] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" style={{ border: '2px solid rgba(220,38,38,0.3)' }}>
              <h3 className="font-bold text-lg text-slate-800 mb-2">Approve Ticket?</h3>
              <p className="text-sm text-slate-600 mb-4">
                Setujui ticket <strong>{approvalTicket.project_name}</strong> dari Team PTS untuk ditangani Team Services?
              </p>
              <div className="flex gap-3">
                <button onClick={() => { setShowApprovalModal(false); setApprovalTicket(null); }}
                  className="flex-1 border border-slate-300 text-slate-700 py-2.5 rounded-xl font-semibold hover:bg-slate-50">
                  Batal
                </button>
                <button onClick={() => handleApprove(approvalTicket)}
                  className="flex-1 text-white py-2.5 rounded-xl font-bold"
                  style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                  ✅ Ya, Approve
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md" style={{ borderBottom: '2.5px solid #dc2626' }}>
          <div className="max-w-[1600px] mx-auto px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>🎫</div>
              <div>
                <h1 className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-red-800">Ticket Troubleshooting</h1>
                <p className="text-xs text-slate-400 font-medium">Team Services · Servisindo</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {pendingApprovalCount > 0 && (
                <button onClick={() => { setApprovalTicket(tickets.find(t => t.services_status === 'Waiting Approval') ?? null); setShowApprovalModal(true); }}
                  className="relative flex items-center gap-1.5 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all"
                  style={{ background: 'linear-gradient(135deg,#ea580c,#c2410c)', boxShadow: '0 2px 8px rgba(234,88,12,0.35)' }}>
                  🔧 Ticket Masuk
                  <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{pendingApprovalCount}</span>
                </button>
              )}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs">
                <div className="w-6 h-6 rounded-full text-white flex items-center justify-center font-bold text-[10px]"
                  style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                  {currentUser?.full_name?.charAt(0)?.toUpperCase()}
                </div>
                <span className="font-semibold text-slate-700 hidden sm:inline">{currentUser?.full_name}</span>
                <span className="text-red-600 font-bold uppercase tracking-widest text-[9px]">{currentUser?.role}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 max-w-[1600px] mx-auto w-full px-5 py-5 space-y-4">

          {/* Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {[
              { label: 'Total Ticket', value: stats.total, sub: 'Semua ticket Services', g: 'linear-gradient(135deg,#4f46e5,#6d28d9)', sh: 'rgba(79,70,229,0.3)', status: 'All' },
              { label: 'Active', value: stats.active, sub: 'Belum selesai', g: 'linear-gradient(135deg,#2563eb,#1d4ed8)', sh: 'rgba(37,99,235,0.3)', status: '' },
              { label: 'Waiting Approval', value: stats.waiting, sub: 'Perlu persetujuan', g: STATUS_GRADIENTS['Waiting Approval'].gradient, sh: STATUS_GRADIENTS['Waiting Approval'].shadow, status: 'Waiting Approval' },
              { label: 'In Repair', value: tickets.filter(t => t.services_status === 'In Repair').length, sub: 'Sedang diperbaiki 🔧', g: STATUS_GRADIENTS['In Repair'].gradient, sh: STATUS_GRADIENTS['In Repair'].shadow, status: 'In Repair' },
              { label: 'Solved', value: stats.solved, sub: 'Selesai ✅', g: STATUS_GRADIENTS['Solved'].gradient, sh: STATUS_GRADIENTS['Solved'].shadow, status: 'Solved' },
            ].map((c, i) => (
              <div key={i} onClick={() => { if (c.status) { setFilterStatus(f => f === c.status ? 'All' : c.status); setHandlerFilter(null); } }}
                className="rounded-2xl p-4 relative overflow-hidden flex flex-col gap-2 cursor-pointer transition-all hover:scale-[1.03] select-none"
                style={{ background: c.g, boxShadow: filterStatus === c.status ? `0 6px 24px ${c.sh}` : `0 3px 12px ${c.sh}`, outline: filterStatus === c.status ? '3px solid white' : 'none' }}>
                {filterStatus === c.status && <span className="absolute top-1 left-2 text-white/80 text-[9px] font-bold uppercase tracking-widest">Filter Aktif ✓</span>}
                <span className="text-3xl font-black text-white leading-none mt-3">{c.value}</span>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">{c.label}</p>
                  <p className="text-[10px] font-medium text-white/75">{c.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Mini charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <StatusDonutCard
              data={stats.statusData}
              total={stats.statusData.reduce((s, d) => s + d.value, 0)}
              onSliceClick={name => { setFilterStatus(f => f === name ? 'All' : name); setHandlerFilter(null); }}
            />
            <HandlerDonutCard
              data={stats.handlerData}
              total={stats.handlerData.reduce((s, d) => s + d.value, 0)}
              onSliceClick={name => { setHandlerFilter(f => f === name ? null : name); setFilterStatus('All'); }}
              activeHandler={handlerFilter}
            />
          </div>

          {/* Ticket List */}
          <div ref={ticketListRef} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)' }}>
            {/* List header + search */}
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-base font-black text-slate-800">TICKET LIST</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: '#dc2626' }}>{filteredTickets.length}</span>
                </div>
                <div className="flex flex-1 flex-wrap gap-2 ml-auto">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[180px]">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                    <input value={searchProject} onChange={e => setSearchProject(e.target.value)} placeholder="Cari project / issue..."
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none" />
                  </div>
                  <div className="relative flex-1 min-w-[150px]">
                    <input value={searchSales} onChange={e => setSearchSales(e.target.value)} placeholder="Cari sales..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none" />
                  </div>
                  {/* Filters */}
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-red-400 outline-none bg-white font-medium cursor-pointer">
                    <option value="All">Semua Status</option>
                    {SERVICES_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-red-400 outline-none bg-white font-medium cursor-pointer">
                    <option value="all">Semua Tahun</option>
                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  {(filterStatus !== 'All' || handlerFilter || searchProject || searchSales) && (
                    <button onClick={() => { setFilterStatus('All'); setHandlerFilter(null); setSearchProject(''); setSearchSales(''); }}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 transition-all">
                      Reset ✕
                    </button>
                  )}
                </div>
              </div>
              {handlerFilter && (
                <p className="text-xs text-slate-500 mt-2 font-medium">
                  Filter handler: <span className="font-bold text-red-600">{handlerFilter}</span>
                  <button onClick={() => setHandlerFilter(null)} className="ml-2 text-slate-400 hover:text-slate-600">✕</button>
                </p>
              )}
            </div>

            {/* Table */}
            {ticketsLoading ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-red-500 rounded-full animate-spin" />
                <span className="text-slate-500 font-medium">Loading tickets...</span>
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-3 opacity-30">🎫</div>
                <p className="text-slate-400 font-medium">Tidak ada ticket ditemukan</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100" style={{ background: 'rgba(248,250,252,0.8)' }}>
                      {['NO', 'NAMA PROJECT', 'ISSUE', 'SALES', 'HANDLER', 'STATUS PTS', 'STATUS SERVICES', 'TANGGAL'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold tracking-widest uppercase text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map((t, idx) => (
                      <tr key={t.id} onClick={() => openTicket(t)}
                        className="border-b border-slate-50 hover:bg-red-50/40 cursor-pointer transition-colors group">
                        <td className="px-4 py-3.5 text-slate-400 font-semibold text-xs">{idx + 1}</td>
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-800 group-hover:text-red-700 transition-colors line-clamp-1">{t.project_name}</p>
                          {t.address && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{t.address}</p>}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-slate-600 line-clamp-1 max-w-[140px]">{t.issue_case}</p>
                          {t.product && <p className="text-xs text-slate-400 mt-0.5">{t.product}</p>}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-700 line-clamp-1">{t.sales_name}</p>
                          {t.sales_division && <p className="text-xs text-slate-400">{t.sales_division}</p>}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-700 line-clamp-1">{t.assign_name}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${STATUS_COLORS[t.status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {t.services_status ? (
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${STATUS_COLORS[t.services_status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                              {t.services_status}
                            </span>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-400 whitespace-nowrap">{formatDateTime(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scale-in { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
