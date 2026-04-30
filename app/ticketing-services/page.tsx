'use client';

// ══════════════════════════════════════════════════════════════════════════════
// TICKETING SERVICES — Platform Team Services (Servisindo)
// Membaca tickets dari Supabase PTS (filter current_team = 'Team Services')
// Update services_status ke kedua DB (PTS + Services)
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// ── Supabase PTS DB (source of truth tickets) ─────────────────────────────────
const supabasePTS = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_PTS_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PTS_ANON_KEY!,
);

// ── Supabase Services DB (users, activity logs lokal) ────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ── WA via Services Supabase Edge Function ────────────────────────────────────
async function sendWA(body: Record<string, unknown>) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
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
const WORKFLOW_STEPS = WORKFLOW_ORDER; // alias

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
// Alias untuk digunakan di detail panel
const SVC_STATUS_COLORS = STATUS_COLORS;

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
  activity_logs?: ActivityLog[];
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
  photo_url?: string;
  photo_name?: string;
  assigned_to_services?: boolean;
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

// ── Unified Donut Chart ────────────────────────────────────────────────────────
function DonutChart({
  data, title, activeKey, onSliceClick
}: {
  data: { name: string; value: number; color: string }[];
  title: string;
  activeKey?: string | null;
  onSliceClick?: (name: string) => void;
}) {
  const [hov, setHov] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)' }}>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{title}</p>
      <p className="text-slate-300 text-sm text-center py-6">Belum ada data</p>
    </div>
  );

  const cx = 60, cy = 60, R = 48, ir = 28;

  // Build slices — full circle if only 1 item
  const slices = data.map((d, i) => {
    const frac = d.value / total;
    if (data.length === 1) return { ...d, i, isCircle: true, path: '' };
    let cum = -Math.PI / 2;
    data.slice(0, i).forEach(dd => { cum += (dd.value / total) * 2 * Math.PI; });
    const sweep = frac * 2 * Math.PI;
    const x1 = cx + R * Math.cos(cum), y1 = cy + R * Math.sin(cum);
    const x2 = cx + R * Math.cos(cum + sweep), y2 = cy + R * Math.sin(cum + sweep);
    const xi1 = cx + ir * Math.cos(cum), yi1 = cy + ir * Math.sin(cum);
    const xi2 = cx + ir * Math.cos(cum + sweep), yi2 = cy + ir * Math.sin(cum + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const path = `M${xi1} ${yi1} L${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${xi2} ${yi2} A${ir} ${ir} 0 ${large} 0 ${xi1} ${yi1}Z`;
    return { ...d, i, isCircle: false, path };
  });

  const hovered = hov !== null ? data[hov] : activeKey ? data.find(d => d.name === activeKey) ?? null : null;

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)' }}>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{title}</p>
      <div className="flex items-center gap-3">
        <svg width="120" height="120" viewBox="0 0 120 120" className="flex-shrink-0">
          {slices.map(s => s.isCircle ? (
            <g key={s.i} onClick={() => onSliceClick?.(s.name)} style={{ cursor: onSliceClick ? 'pointer' : 'default' }}
              onMouseEnter={() => setHov(s.i)} onMouseLeave={() => setHov(null)}>
              <circle cx={cx} cy={cy} r={R} fill={s.color}
                opacity={hov === null || hov === s.i ? 1 : 0.4}
                style={{ filter: hov === s.i ? `drop-shadow(0 0 6px ${s.color})` : 'none' }} />
              <circle cx={cx} cy={cy} r={ir} fill="white" />
            </g>
          ) : (
            <path key={s.i} d={s.path} fill={s.color}
              opacity={hov === null || hov === s.i ? 1 : 0.4}
              style={{
                cursor: onSliceClick ? 'pointer' : 'default',
                transition: 'opacity 0.15s',
                filter: hov === s.i || activeKey === s.name ? `drop-shadow(0 0 5px ${s.color})` : 'none'
              }}
              onMouseEnter={() => setHov(s.i)} onMouseLeave={() => setHov(null)}
              onClick={() => onSliceClick?.(s.name)} />
          ))}
          <text x={cx} y={cy - 5} textAnchor="middle" fontSize="17" fontWeight="900" fill="#1e293b">
            {hovered ? hovered.value : total}
          </text>
          <text x={cx} y={cy + 9} textAnchor="middle" fontSize="7" fill="#94a3b8" fontWeight="600">
            {hovered ? hovered.name.slice(0, 9) : 'TOTAL'}
          </text>
        </svg>
        <div className="flex flex-col gap-1.5 flex-1 min-w-0 max-h-[110px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {slices.map(s => {
            const isActive = activeKey === s.name || hov === s.i;
            return (
              <div key={s.i}
                className="flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 transition-all"
                style={{ background: isActive ? `${s.color}18` : 'transparent', cursor: onSliceClick ? 'pointer' : 'default', outline: activeKey === s.name ? `1px solid ${s.color}` : 'none' }}
                onMouseEnter={() => setHov(s.i)} onMouseLeave={() => setHov(null)}
                onClick={() => onSliceClick?.(s.name)}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <span className="text-[10px] font-semibold text-slate-600 truncate flex-1">{s.name}</span>
                <span className="text-[10px] font-bold flex-shrink-0" style={{ color: s.color }}>{s.value}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Aliases kept for backward compat with call sites
function StatusDonutCard({ data, total, onSliceClick }: { data: { name: string; value: number; color: string }[]; total: number; onSliceClick: (name: string) => void }) {
  return <DonutChart data={data} title="📊 Services Status" onSliceClick={onSliceClick} />;
}
function HandlerDonutCard({ data, total, onSliceClick, activeHandler }: { data: { name: string; value: number; color: string }[]; total: number; onSliceClick: (n: string) => void; activeHandler: string | null }) {
  return <DonutChart data={data} title="👥 Handler" activeKey={activeHandler} onSliceClick={onSliceClick} />;
}
function MiniDonutChart({ data, title, emptyMsg }: { data: { name: string; value: number; color: string }[]; title: string; emptyMsg: string }) {
  return <DonutChart data={data} title={title} />;
}

// ── InfoLine ──────────────────────────────────────────────────────────────────
function InfoLine({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="py-2 border-b border-gray-50 last:border-0">
      <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 block">{label}</span>
      <span className="text-sm text-gray-800 font-medium break-words">{value}</span>
    </div>
  );
}

// ── New Ticket Modal ──────────────────────────────────────────────────────────
function NewTicketModal({ currentUser, teamMembers, onClose, onSaved }: {
  currentUser: User; teamMembers: User[]; onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [guestUsers, setGuestUsers] = useState<{ id: string; full_name: string; sales_division?: string }[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const todayStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
  const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

  const [form, setForm] = useState({
    project_name: '', address: '', customer_phone: '', sales_name: '', sales_division: '',
    sn_unit: '', product: '', issue_case: '', description: '', assign_name: '',
    date: todayISO,
    photo: null as File | null,
  });
  const f = (p: Partial<typeof form>) => setForm(prev => ({ ...prev, ...p }));
  const isAdmin = currentUser.role === 'admin';

  const iStyle = { background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.12)' };
  const iCls = 'w-full rounded-xl pl-9 pr-4 py-3 text-sm outline-none transition-all text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-red-500/40';
  const lCls = 'block text-xs font-bold mb-1.5 tracking-widest uppercase';

  useEffect(() => {
    supabasePTS.from('users').select('id, full_name, sales_division').eq('role', 'guest').order('full_name')
      .then(({ data }: { data: any[] | null }) => { if (data) setGuestUsers(data); });
  }, []);

  const wordCount = form.issue_case.trim().split(/\s+/).filter(Boolean).length;

  const handleSubmit = async () => {
    if (!form.project_name.trim()) { alert('Nama Project wajib diisi!'); return; }
    if (!form.issue_case.trim()) { alert('Issue Case wajib diisi!'); return; }
    if (isAdmin && !form.assign_name) { alert('Admin wajib assign ke handler!'); return; }
    setSaving(true);
    try {
      let photoUrl = '', photoName = '';
      if (form.photo) {
        const ext = form.photo.name.split('.').pop();
        const path = `svc-photos/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('ticket-files').upload(path, form.photo);
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('ticket-files').getPublicUrl(path);
          photoUrl = urlData.publicUrl ?? ''; photoName = form.photo.name;
        }
      }
      const payload: Record<string, unknown> = {
        project_name: form.project_name.trim(),
        address: form.address.trim() || null,
        customer_phone: form.customer_phone.trim() || null,
        sales_name: form.sales_name || null,
        sales_division: form.sales_division || null,
        sn_unit: form.sn_unit.trim() || null,
        product: form.product.trim() || null,
        issue_case: form.issue_case.trim(),
        description: form.description.trim() || null,
        assign_name: isAdmin ? form.assign_name : '',
        date: form.date,
        status: isAdmin ? 'Verifying Warranty' : 'Waiting Approval',
        services_status: isAdmin ? 'Verifying Warranty' : 'Waiting Approval',
        current_team: 'Team Services',
        created_by: currentUser.username,
        photo_url: photoUrl || null,
        photo_name: photoName || null,
      };
      const { error } = await supabase.from('tickets').insert([payload]);
      if (error) throw new Error(error.message);
      if (!isAdmin) {
        try {
          const { data: admins } = await supabase.from('users').select('phone_number,full_name').eq('role','admin').not('phone_number','is',null).neq('phone_number','');
          if (admins?.length) {
            const msg = ['🔔 *Request Ticket Baru — Servisindo*','━━━━━━━━━━━━━━━━━━',`📌 Project: ${form.project_name}`,`⚠️ Issue: ${form.issue_case}`,`👤 Dari: ${currentUser.full_name}`,'━━━━━━━━━━━━━━━━━━','Buka platform Work Management Servisindo untuk approval.'].join('\n');
            await Promise.allSettled((admins as any[]).map((a:any) => sendWA({ type:'reminder_wa', target:a.phone_number, message:msg })));
          }
        } catch { /* WA tidak block submit */ }
      }
      onSaved();
    } catch (e: any) { alert('Gagal: ' + e.message); }
    setSaving(false);
  };

  const sectionDiv = (icon: string, label: string) => (
    <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
      <span className="text-lg">{icon}</span>
      <span className="text-sm font-bold tracking-wide text-slate-700">{label}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden" style={{ border: '2px solid rgba(220,38,38,0.3)' }}>
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
          <div>
            <h2 className="font-black text-white text-lg flex items-center gap-2">🎫 Create New Ticket</h2>
            <p className="text-red-200 text-xs mt-0.5">Isi detail ticket &amp; informasi troubleshooting</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── Section: Informasi Ticket ── */}
          {sectionDiv('🎫', 'Informasi Ticket')}

          {/* Row 1: Project Name | Address */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={lCls} style={{ color: '#94a3b8' }}>Project Name *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2">📌</span>
                <input value={form.project_name} onChange={e => f({ project_name: e.target.value })}
                  placeholder="Example: BCA Cibitung Project" className={iCls} style={iStyle}/>
              </div>
            </div>
            <div>
              <label className={lCls} style={{ color: '#94a3b8' }}>📍 Address Detail</label>
              <div className="relative">
                <span className="absolute left-3 top-3">📍</span>
                <textarea value={form.address} onChange={e => f({ address: e.target.value })}
                  rows={2} placeholder="Example: Jl. Jend. Sudirman No. 1..."
                  className="w-full rounded-xl pl-9 pr-4 py-3 text-sm outline-none transition-all text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-red-500/40 resize-none"
                  style={iStyle}/>
              </div>
            </div>
          </div>

          {/* Row 2: Product | SN Unit */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={lCls} style={{ color: '#94a3b8' }}>📦 Product / Brand</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2">📦</span>
                <input value={form.product} onChange={e => f({ product: e.target.value })}
                  placeholder="Panasonic PT-MZ682, LG 75UL3Q, dll" className={iCls} style={iStyle}/>
              </div>
            </div>
            <div>
              <label className={lCls} style={{ color: '#94a3b8' }}>SN Unit <span className="text-gray-400 normal-case font-normal text-[10px]">(opsional)</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2">🔢</span>
                <input value={form.sn_unit} onChange={e => f({ sn_unit: e.target.value })}
                  placeholder="SN12345678 (opsional)" className={iCls} style={iStyle}/>
              </div>
            </div>
          </div>

          {/* Row 3: Customer Phone | Date (auto, disabled) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={lCls} style={{ color: '#94a3b8' }}>Customer Phone</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2">📱</span>
                <input value={form.customer_phone} onChange={e => f({ customer_phone: e.target.value })}
                  placeholder="Adi - 08xx-xxxx-xxxx" className={iCls} style={iStyle}/>
              </div>
            </div>
            <div>
              <label className={lCls} style={{ color: '#94a3b8' }}>📅 Date <span className="text-gray-400 normal-case font-normal text-[10px]">(hari ini)</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">📅</span>
                <input type="text" value={todayStr} disabled
                  className="w-full rounded-xl pl-9 pr-4 py-3 text-sm text-slate-400 cursor-not-allowed"
                  style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }}/>
              </div>
            </div>
          </div>

          {/* Issue Case — 4 kata maks */}
          <div>
            <label className={lCls} style={{ color: '#94a3b8' }}>Issue Case *</label>
            <div className="relative">
              <span className="absolute left-3 top-3">⚠️</span>
              <input value={form.issue_case}
                onChange={e => {
                  const val = e.target.value;
                  const words = val.trim().split(/\s+/).filter(Boolean);
                  if (words.length < 4 || (words.length === 4 && !val.endsWith(' '))) f({ issue_case: val });
                }}
                placeholder="Maks. 4 kata, contoh: Videowall Not Working"
                className={iCls} style={iStyle}/>
            </div>
            <div className="flex justify-between items-center mt-1.5 px-1">
              <span className="text-xs text-gray-500">Maksimal 4 kata</span>
              <span className={`text-xs font-bold ${wordCount >= 4 ? 'text-red-500' : 'text-gray-400'}`}>{wordCount}/4 kata</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={lCls} style={{ color: '#94a3b8' }}>📝 Detailed Description</label>
            <textarea value={form.description} onChange={e => f({ description: e.target.value })}
              rows={3} placeholder="Explain the problem details..."
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-red-500/40 resize-none"
              style={iStyle}/>
          </div>

          {/* ── Section: Informasi Sales ── */}
          <div className="pt-1">{sectionDiv('🏢', 'Informasi Sales')}</div>

          {/* Sales Name dropdown dari Guest PTS + auto-fill division */}
          <div>
            <label className={lCls} style={{ color: '#94a3b8' }}>Sales Name</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2">👤</span>
              <select value={form.sales_name}
                onChange={e => {
                  const sel = guestUsers.find(g => g.full_name === e.target.value);
                  f({ sales_name: e.target.value, sales_division: sel?.sales_division ?? '' });
                }}
                className="w-full rounded-xl pl-9 pr-8 py-3 text-sm outline-none transition-all text-slate-800 focus:ring-2 focus:ring-red-500/40 appearance-none cursor-pointer"
                style={iStyle}>
                <option value="">— Pilih Sales —</option>
                {guestUsers.map(g => (
                  <option key={g.id} value={g.full_name}>
                    {g.full_name}{g.sales_division ? ` (${g.sales_division})` : ''}
                  </option>
                ))}
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">▾</span>
            </div>
            {/* Sales Division — auto dari pilihan Sales, read-only */}
            {form.sales_division && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)' }}>
                <span className="text-xs">🏷️</span>
                <span className="text-xs font-semibold text-purple-700">Divisi: {form.sales_division}</span>
              </div>
            )}
          </div>

          {/* ── Section: Assign Handler (admin only) ── */}
          {isAdmin && (
            <>
              <div className="pt-1">{sectionDiv('👷', 'Assign Handler')}</div>
              <div>
                <label className={lCls} style={{ color: '#94a3b8' }}>Assign To *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2">👨‍💼</span>
                  <select value={form.assign_name} onChange={e => f({ assign_name: e.target.value })}
                    className="w-full rounded-xl pl-9 pr-8 py-3 text-sm outline-none transition-all text-slate-800 focus:ring-2 focus:ring-red-500/40 appearance-none cursor-pointer"
                    style={iStyle}>
                    <option value="">— Pilih Handler —</option>
                    {teamMembers.map(m => <option key={m.id} value={m.full_name}>{m.full_name}</option>)}
                  </select>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">▾</span>
                </div>
              </div>
            </>
          )}

          {/* Info approval untuk non-admin */}
          {!isAdmin && (
            <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'rgba(245,158,11,0.1)', border: '1.5px solid rgba(245,158,11,0.3)' }}>
              <span className="text-2xl">⏳</span>
              <div>
                <p className="text-sm font-bold text-orange-800">Perlu Persetujuan Admin</p>
                <p className="text-xs text-orange-700 mt-0.5">Ticket yang Anda buat akan masuk ke antrian approval Admin terlebih dahulu.</p>
              </div>
            </div>
          )}

          {/* ── Section: Foto ── */}
          <div className="pt-1">{sectionDiv('📸', 'Foto Pendukung')}</div>
          <div>
            <label className={lCls} style={{ color: '#94a3b8' }}>Upload Foto <span className="text-gray-400 font-normal normal-case">(Opsional)</span></label>
            <p className="text-xs text-gray-500 mb-3">Foto kondisi awal / bukti masalah</p>
            <input type="file" accept="image/*"
              onChange={e => {
                const file = e.target.files?.[0] || null;
                f({ photo: file });
                setPhotoPreview(file ? URL.createObjectURL(file) : null);
              }}
              className="w-full border rounded-xl px-4 py-2.5 bg-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100 transition-all text-sm"
              style={{ borderColor: 'rgba(0,0,0,0.12)' }}/>
            {form.photo && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 p-2 bg-white rounded-lg border" style={{ borderColor: 'rgba(220,38,38,0.2)' }}>
                  <span className="text-red-600">✓</span>
                  <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{form.photo.name}</span>
                  <span className="text-xs text-gray-400">({(form.photo.size / 1024).toFixed(1)} KB)</span>
                  <button type="button" onClick={() => { f({ photo: null }); setPhotoPreview(null); }} className="text-red-400 hover:text-red-600 font-bold text-xs ml-1">✕</button>
                </div>
                {photoPreview && <img src={photoPreview} alt="Preview" className="w-full max-h-48 object-cover rounded-lg border-2 shadow-sm" style={{ borderColor: 'rgba(220,38,38,0.3)' }}/>}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all"
            style={{ background: 'rgba(255,255,255,0.95)', color: '#64748b', border: '1px solid rgba(0,0,0,0.12)' }}>
            Batal
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-[2] text-white py-3 rounded-xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
            {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
            {saving ? 'Menyimpan...' : isAdmin ? '✅ Buat Ticket' : '📨 Submit Ticket'}
          </button>
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
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Ticket | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [newActivity, setNewActivity] = useState({
    action_taken: '',
    notes: '',
    new_status: 'Verifying Warranty' as ServicesStatus,
    file: null as File | null,
    photo: null as File | null,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalTicket, setApprovalTicket] = useState<Ticket | null>(null);
  const [approvalAssignTo, setApprovalAssignTo] = useState('');

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
      // 1) Dari PTS DB: tickets yang di-assign ke Services (dengan activity logs)
      const { data: ptsData } = await supabasePTS.from('tickets')
        .select('*, activity_logs(*)')
        .or('current_team.eq.Team Services,services_status.not.is.null')
        .order('created_at', { ascending: false });

      // 2) Dari Services DB: ticket lokal (new tickets langsung dari Services platform)
      const { data: svcLocalData } = await supabase.from('tickets')
        .select('*').order('created_at', { ascending: false });

      // 3) Activity logs dari Services DB
      const { data: svcLogs } = await supabase.from('activity_logs')
        .select('*').order('created_at', { ascending: false });

      // 4) Merge: PTS sebagai base, Services local ditambahkan jika ID baru
      const ptsIds = new Set((ptsData ?? []).map((t: any) => t.id));
      const merged: Ticket[] = [...((ptsData ?? []) as Ticket[])];
      for (const st of (svcLocalData ?? [])) {
        if (!ptsIds.has((st as any).id)) merged.push(st as Ticket);
      }

      // 5) Enrich semua dengan Services activity logs (cross-reference)
      const enriched = merged.map(t => {
        const existingLogs: ActivityLog[] = t.activity_logs || [];
        const svcTicketLogs = (svcLogs ?? []).filter((l: any) => l.ticket_id === t.id);
        const allLogs = [...existingLogs, ...svcTicketLogs]
          .reduce((acc: ActivityLog[], log: ActivityLog) => {
            if (!acc.find((l: ActivityLog) => l.id === log.id)) acc.push(log); return acc;
          }, [] as ActivityLog[])
          .sort((a: ActivityLog, b: ActivityLog) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return { ...t, activity_logs: allLogs };
      });

      setTickets(enriched);
    } catch (e) { console.error('[fetchData]', e); }

    // Team members dari Services DB
    try {
      const { data: members } = await supabase.from('users').select('*').order('full_name');
      setTeamMembers((members ?? []) as User[]);
    } catch { /* ignore */ }

    setTimeout(() => setTicketsLoading(false), 300);
  }, []);

  // ── Dual Realtime — PTS + Services ──────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    // PTS realtime
    const ch1 = supabasePTS.channel('svc-pts-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        setTimeout(() => fetchData(currentUser), 500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => {
        setTimeout(() => fetchData(currentUser), 500);
      })
      .subscribe();
    // Services DB realtime
    const ch2 = supabase.channel('svc-local-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        setTimeout(() => fetchData(currentUser), 600);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => {
        setTimeout(() => fetchData(currentUser), 600);
      })
      .subscribe();
    return () => {
      supabasePTS.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [isLoggedIn, currentUser, fetchData]);

  // ── Login ────────────────────────────────────────────────────────────────
  // ── Delete ticket (Services DB only — TIDAK menyentuh PTS DB) ───────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setShowLoadingPopup(true);
    setLoadingMsg('Menghapus ticket...');
    try {
      // HANYA hapus dari Services DB — PTS DB tidak disentuh sama sekali
      await supabase.from('activity_logs').delete().eq('ticket_id', deleteTarget.id);
      await supabase.from('tickets').delete().eq('id', deleteTarget.id);
      await fetchData(currentUser);
      setLoadingMsg('✅ Ticket dihapus!');
      setTimeout(() => {
        setShowLoadingPopup(false);
        setShowDeleteModal(false);
        setDeleteTarget(null);
        setDeleteConfirmText('');
        setShowDetail(false);
      }, 1200);
    } catch (e: any) {
      setShowLoadingPopup(false);
      alert('Error: ' + e.message);
    }
  };

  const exportToPDF = (ticket: Ticket) => {
    const pd = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
    const svcSt = ticket.services_status||'-';
    const actRows = (ticket.activity_logs||[]).sort((a: ActivityLog, b: ActivityLog)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()).map((log,i)=>`
      <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
        <td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:11px;color:#64748b;vertical-align:top;width:120px;white-space:nowrap">${formatDateTime(log.created_at)}<br/><span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;background:#fef3c7;color:#92400e">Services</span></td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;vertical-align:top;width:130px"><span style="font-weight:700;font-size:12px">${log.handler_name||'-'}</span><br/><span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;background:#eff6ff;color:#1d4ed8">${log.new_status}</span></td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;vertical-align:top">${log.action_taken?`<div style="font-size:11px;font-weight:700;color:#1d4ed8">🔧 ${log.action_taken}</div>`:''}${log.notes?`<div style="font-size:12px;color:#1e293b">${log.notes}</div>`:''}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket — ${ticket.project_name}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;font-size:13px}
.page{padding:28px 32px;max-width:900px;margin:0 auto}.header{background:linear-gradient(135deg,#dc2626,#991b1b);color:white;border-radius:12px;padding:18px 22px;margin-bottom:20px;display:flex;justify-content:space-between}
.section{border:1.5px solid #e2e8f0;border-radius:10px;margin-bottom:16px;overflow:hidden}
.stitle{background:#fff1f2;padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9f1239;border-bottom:1px solid #fecdd3}
.grid2{display:grid;grid-template-columns:1fr 1fr}.grid2>*{border-right:1px solid #e2e8f0}.grid2>*:last-child{border-right:none}
.ib{padding:10px 14px;border-bottom:1px solid #e2e8f0}.ib:last-child{border-bottom:none}
.il{font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;margin-bottom:3px}
.iv{font-size:12px;font-weight:600;color:#1e293b;line-height:1.5}
table.log{width:100%;border-collapse:collapse}.footer{margin-top:20px;padding-top:12px;border-top:1.5px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8}
</style></head><body><div class="page">
<div class="header"><div><h1 style="font-size:17px;font-weight:800;margin-bottom:3px">🔧 Servisindo — Report Ticket Services</h1><p style="font-size:11px;opacity:.85">ID: ${ticket.id?.substring(0,8).toUpperCase()} | Services: ${svcSt}</p></div>
<div style="text-align:right;font-size:11px;opacity:.85"><div><b>Dicetak:</b> ${pd}</div><div><b>Handler:</b> ${ticket.assign_name||'—'}</div></div></div>
<div class="section"><div class="stitle">🎫 Informasi Ticket</div><div class="grid2">
<div><div class="ib"><div class="il">Project</div><div class="iv" style="font-size:14px;font-weight:800;color:#dc2626">${ticket.project_name}</div></div>
<div class="ib"><div class="il">Issue</div><div class="iv">${ticket.issue_case}</div></div>
<div class="ib"><div class="il">Deskripsi</div><div class="iv" style="font-weight:400">${ticket.description||'—'}</div></div></div>
<div><div class="ib"><div class="il">Alamat</div><div class="iv">${ticket.address||'—'}</div></div>
<div class="ib"><div class="il">Product</div><div class="iv">${ticket.product||'—'}</div></div>
<div class="ib"><div class="il">SN Unit</div><div class="iv">${ticket.sn_unit||'—'}</div></div></div></div></div>
<div class="section"><div class="stitle">👤 Customer & Status</div><div class="grid2">
<div><div class="ib"><div class="il">Customer / User</div><div class="iv">${ticket.customer_phone||'—'}</div></div>
<div class="ib"><div class="il">Sales</div><div class="iv">${ticket.sales_name||'—'}</div></div></div>
<div><div class="ib"><div class="il">Status PTS</div><div class="iv">${ticket.status}</div></div>
<div class="ib"><div class="il">Status Services</div><div class="iv" style="color:#dc2626;font-weight:800">${svcSt}</div></div>
<div class="ib"><div class="il">Dibuat</div><div class="iv">${formatDateTime(ticket.created_at)}</div></div></div></div></div>
<div class="section"><div class="stitle">📋 Activity Log</div>
${actRows?`<table class="log"><thead><tr style="background:#fff1f2"><th style="padding:8px 10px;font-size:10px;font-weight:700;text-align:left;color:#9f1239;border-bottom:1.5px solid #fecdd3;width:130px">Waktu</th><th style="padding:8px 10px;font-size:10px;font-weight:700;text-align:left;color:#9f1239;border-bottom:1.5px solid #fecdd3;width:140px">Handler</th><th style="padding:8px 10px;font-size:10px;font-weight:700;text-align:left;color:#9f1239;border-bottom:1.5px solid #fecdd3">Notes</th></tr></thead><tbody>${actRows}</tbody></table>`:
'<div style="padding:20px;text-align:center;color:#94a3b8">Belum ada activity log</div>'}
</div>
${ticket.photo_url?`<div class="section"><div class="stitle">📸 Foto</div><div style="padding:12px;text-align:center"><img src="${ticket.photo_url}" style="max-height:200px;border-radius:8px;border:1.5px solid #e2e8f0"/></div></div>`:''}
<div class="footer"><div>🔧 Servisindo Multimedia Service Center</div><div>${pd}</div></div>
</div></body></html>`;
    const w = window.open('','_blank');
    if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),300);}
  };

  const handleLogin = async () => {
    if (!loginForm.username || !loginForm.password) { setLoginError('Wajib diisi!'); return; }
    setLoginLoading(true); setLoginError('');
    try {
      const { data, error } = await supabase.from('users').select('*')
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
      const { data } = await supabasePTS.from('activity_logs')
        .select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
      setActivityLogs((data ?? []) as ActivityLog[]);
    } catch {
      const { data } = await supabase.from('activity_logs')
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

  // ── Approve ticket (Waiting Approval → Verifying Warranty) ──────────────────────────
  const handleApprove = async (ticket: Ticket, assignTo?: string) => {
    setShowLoadingPopup(true);
    setLoadingMsg('Menyetujui ticket...');
    const handlerName = assignTo || ticket.assign_name || '';
    try {
      await supabasePTS.from('tickets').update({
        services_status: 'Verifying Warranty',
        ...(handlerName ? { assign_name: handlerName } : {}),
      }).eq('id', ticket.id);
      await supabasePTS.from('activity_logs').insert([{
        ticket_id: ticket.id,
        handler_name: currentUser?.full_name ?? '',
        handler_username: currentUser?.username ?? '',
        action_taken: `Ticket disetujui oleh Admin${handlerName ? ` & di-assign ke ${handlerName}` : ''}`,
        notes: '',
        new_status: 'Verifying Warranty',
        team_type: 'Team Services',
        created_at: new Date().toISOString(),
      }]);
      await fetchData(currentUser);
      setShowApprovalModal(false);
      setApprovalTicket(null);
      setApprovalAssignTo('');
      if (selectedTicket?.id === ticket.id) {
        setSelectedTicket(t => t ? { ...t, services_status: 'Verifying Warranty', ...(handlerName ? { assign_name: handlerName } : {}) } : t);
        await fetchLogs(ticket.id);
      }
    } catch (e: any) { alert('Gagal approve: ' + e.message); }
    setLoadingMsg('✅ Ticket disetujui!');
    setTimeout(() => setShowLoadingPopup(false), 1200);
  };

  // ── Reject ticket (Waiting Approval → hapus / reject) ────────────────────────
  const handleReject = async (ticket: Ticket) => {
    if (!confirm(`Tolak ticket "${ticket.project_name}"? Ticket akan dihapus dari antrian.`)) return;
    setShowLoadingPopup(true);
    setLoadingMsg('Menolak ticket...');
    try {
      await supabasePTS.from('tickets').update({ services_status: 'Void' }).eq('id', ticket.id);
      await supabasePTS.from('activity_logs').insert([{
        ticket_id: ticket.id,
        handler_name: currentUser?.full_name ?? '',
        handler_username: currentUser?.username ?? '',
        action_taken: 'Ticket ditolak oleh Admin',
        notes: 'Ticket rejected dari antrian approval',
        new_status: 'Void',
        team_type: 'Team Services',
        created_at: new Date().toISOString(),
      }]);
      await fetchData(currentUser);
      setShowApprovalModal(false);
      setApprovalTicket(null);
      setApprovalAssignTo('');
    } catch (e: any) { alert('Gagal reject: ' + e.message); }
    setLoadingMsg('✅ Ticket ditolak!');
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
        const { error: upErr } = await supabase.storage.from('ticket-files').upload(path, newActivity.file);
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('ticket-files').getPublicUrl(path);
          fileUrl = urlData.publicUrl ?? '';
          fileName = newActivity.file.name;
        }
      } catch { /* fallback: no file url */ }
    }

    let photoUrl = '';
    let photoName = '';
    if (newActivity.photo) {
      setLoadingMsg('Upload foto...');
      const ext = newActivity.photo.name.split('.').pop();
      const path = `svc-photos/${selectedTicket.id}-${Date.now()}.${ext}`;
      try {
        const { error: upErr } = await supabase.storage.from('ticket-files').upload(path, newActivity.photo);
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('ticket-files').getPublicUrl(path);
          photoUrl = urlData.publicUrl ?? '';
          photoName = newActivity.photo.name;
        }
      } catch { /* fallback: no photo url */ }
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
      photo_url:        photoUrl,
      photo_name:       photoName,
      assigned_to_services: false,
      created_at:       new Date().toISOString(),
    };

    try {
      // 1) Insert log ke PTS DB (cross-reference)
      await supabasePTS.from('activity_logs').insert([{
        ...logBase,
        ticket_id: selectedTicket.id,
        pts_ticket_id: selectedTicket.id,
      }]);

      // 2) Insert log ke Services DB (lokal)
      await supabase.from('activity_logs').insert([{
        ...logBase,
        ticket_id: selectedTicket.id,
        pts_ticket_id: selectedTicket.id,
      }]);

      // 3) Update services_status di PTS DB
      await supabasePTS.from('tickets').update({
        services_status: newActivity.new_status,
        ...(newActivity.new_status === 'Solved' ? { current_team: 'Team Services' } : {}),
      }).eq('id', selectedTicket.id);

      // 4) Update/insert di Services DB (mirror)
      const { data: existSvc } = await supabase.from('tickets').select('id').eq('pts_ticket_id', selectedTicket.id).maybeSingle();
      if (existSvc) {
        await supabase.from('tickets').update({
          services_status: newActivity.new_status,
        }).eq('pts_ticket_id', selectedTicket.id);
      } else {
        // Buat mirror ticket jika belum ada
        await supabase.from('tickets').insert([{
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
            product:      selectedTicket.product ?? '',
            pic_name:     selectedTicket.customer_phone ?? '',
            notes:        repairSchedule.notes
              ? `${repairSchedule.notes} | Ticket ID: ${selectedTicket.id}`
              : `Dibuat otomatis saat ticket masuk In Repair. Ticket ID: ${selectedTicket.id}`,
            source_ticket_id:     selectedTicket.id,
            source_pts_ticket_id: selectedTicket.id,
            created_by: currentUser?.username ?? 'system',
          };

          const { error: reminderErr } = await supabase.from('reminders').insert([reminderPayload]);
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
      // Refresh data TANPA menghilangkan ticket dari list
      // Ticket tetap muncul karena filter menggunakan services_status, bukan menghapusnya
      await fetchData(currentUser);
      await fetchLogs(selectedTicket.id);

      setNewActivity({ action_taken: '', notes: '', new_status: 'Verifying Warranty', file: null, photo: null });
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

    // Product stats
    const productCounts: Record<string, number> = {};
    svcTickets.forEach(t => { if (t.product) productCounts[t.product] = (productCounts[t.product] ?? 0) + 1; });
    const chartColors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6','#f43f5e'];
    const productData = Object.entries(productCounts).map(([name, value], i) => ({ name, value, color: chartColors[i % chartColors.length] })).sort((a, b) => b.value - a.value).slice(0, 10);

    // Sales division stats
    const divCounts: Record<string, number> = {};
    svcTickets.forEach(t => { if (t.sales_division) divCounts[t.sales_division] = (divCounts[t.sales_division] ?? 0) + 1; });
    const divData = Object.entries(divCounts).map(([name, value], i) => ({ name, value, color: chartColors[i % chartColors.length] })).sort((a, b) => b.value - a.value).slice(0, 10);

    return { total, active, solved, waiting, statusData, handlerData, productData, divData };
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

        {/* Ticket Detail Side Panel — Right sidebar style */}
        {showDetail && selectedTicket && (
          <div className="fixed inset-0 z-[9000] flex">
            <div className="flex-1 bg-black/40" onClick={() => { setShowDetail(false); setShowUpdateForm(false); }} />
            {/* Right panel container — workflow + detail side by side */}
            <div className={`flex overflow-hidden shadow-2xl transition-all duration-200 ${showUpdateForm ? 'w-[860px]' : 'w-[560px]'}`}
              style={{ borderLeft: '2px solid #dc2626', maxHeight: '100vh', animation: 'slide-in-right 0.22s ease-out' }}>

              {/* LEFT: Workflow Progress Column */}
              <div className="w-[110px] flex-shrink-0 bg-slate-50 border-r border-slate-100 flex flex-col overflow-hidden">
                <div className="px-2 py-3 border-b border-slate-100 flex-shrink-0" style={{ background: 'linear-gradient(180deg,#dc2626,#991b1b)' }}>
                  <p className="text-[9px] font-black text-white uppercase tracking-widest text-center">Workflow</p>
                  <p className="text-[8px] text-white/60 text-center mt-0.5">Services</p>
                </div>
                <div className="flex-1 overflow-y-auto py-3 px-2" style={{ scrollbarWidth: 'none' }}>
                  {WORKFLOW_STEPS.map((step, i) => {
                    const curIdx = WORKFLOW_STEPS.indexOf((selectedTicket.services_status ?? 'Verifying Warranty') as ServicesStatus);
                    const isPast = i < curIdx; const isActive = i === curIdx;
                    return (
                      <div key={step} className="flex flex-col items-center mb-1">
                        <div className="flex items-start w-full gap-1.5">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black flex-shrink-0 text-white mt-0.5 ${isActive ? 'ring-2 ring-white ring-offset-1' : ''}`}
                            style={{ background: isPast ? '#10b981' : isActive ? '#dc2626' : '#cbd5e1', boxShadow: isActive ? '0 0 0 3px rgba(220,38,38,0.2)' : 'none' }}>
                            {isPast ? '✓' : i + 1}
                          </div>
                          <span className="text-[8.5px] font-semibold leading-tight flex-1 pt-0.5"
                            style={{ color: isActive ? '#dc2626' : isPast ? '#10b981' : '#94a3b8' }}>
                            {step.replace('Verifying ', 'Ver.').replace(' Submitted', '').replace(' Deployed', '').replace('Repaired ', '')}
                          </span>
                        </div>
                        {i < WORKFLOW_STEPS.length - 1 && (
                          <div className="h-2.5 w-0.5 ml-2 self-start mt-0.5" style={{ background: isPast ? '#10b981' : '#e2e8f0' }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CENTER: Detail panel */}
              <div className="flex-1 bg-white flex flex-col overflow-hidden min-w-0">

                {/* Panel top header */}
                <div className="px-4 py-3 flex items-center justify-between flex-shrink-0 border-b border-slate-100">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"/></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-500 leading-none">Detail Ticket</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">{selectedTicket.current_team || 'Team Services'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {(currentUser?.role === 'admin' || currentUser?.role === 'team') && selectedTicket.services_status !== 'Solved' && selectedTicket.services_status !== 'Waiting Approval' && (
                      <button onClick={() => setShowUpdateForm(v => !v)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                        style={showUpdateForm ? { background: '#f1f5f9', color: '#475569', borderColor: '#e2e8f0' } : { background: 'rgba(220,38,38,0.07)', color: '#dc2626', borderColor: 'rgba(220,38,38,0.2)' }}>
                        {showUpdateForm ? 'Tutup' : 'Update'}
                      </button>
                    )}
                    <button onClick={() => { setShowDetail(false); setShowUpdateForm(false); }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                {/* Status row */}
                <div className="px-4 py-2 flex items-center gap-2 flex-shrink-0 border-b border-slate-100">
                  {selectedTicket.services_status && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${SVC_STATUS_COLORS[selectedTicket.services_status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {selectedTicket.services_status}
                    </span>
                  )}
                </div>

                {/* Project name + address */}
                <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
                  <h3 className="font-black text-base text-slate-800 leading-snug">{selectedTicket.project_name}</h3>
                  {selectedTicket.address && (
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                      {selectedTicket.address}
                    </p>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto">
                  {/* Info rows */}
                  <div className="border-b border-slate-100">
                    <div className="px-4 py-3 divide-y divide-slate-50">
                      <div className="flex items-start gap-3 py-2.5">
                        <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                        <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Handler</p><p className="text-sm font-semibold text-slate-800">{selectedTicket.assign_name || '—'}</p></div>
                      </div>
                      <div className="flex items-start gap-3 py-2.5">
                        <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Issue</p><p className="text-sm font-semibold text-slate-800">{selectedTicket.issue_case}</p></div>
                      </div>
                      {selectedTicket.description && (
                        <div className="flex items-start gap-3 py-2.5">
                          <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Deskripsi</p><p className="text-sm text-slate-700 leading-relaxed">{selectedTicket.description}</p></div>
                        </div>
                      )}
                      {selectedTicket.product && (
                        <div className="flex items-start gap-3 py-2.5">
                          <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                          <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Product</p><p className="text-sm font-semibold text-slate-800">{selectedTicket.product}</p></div>
                        </div>
                      )}
                      {selectedTicket.sn_unit && (
                        <div className="flex items-start gap-3 py-2.5">
                          <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/></svg>
                          <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">SN Unit</p><p className="text-sm font-mono text-slate-800">{selectedTicket.sn_unit}</p></div>
                        </div>
                      )}
                      {selectedTicket.customer_phone && (
                        <div className="flex items-start gap-3 py-2.5">
                          <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                          <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Customer / User</p><p className="text-sm font-semibold text-slate-800">{selectedTicket.customer_phone}</p></div>
                        </div>
                      )}
                      {selectedTicket.sales_name && (
                        <div className="flex items-start gap-3 py-2.5">
                          <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                          <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Sales</p>
                            <p className="text-sm font-semibold text-slate-800">{selectedTicket.sales_name}</p>
                            {selectedTicket.sales_division && <p className="text-[11px] text-slate-400">{selectedTicket.sales_division}</p>}
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-3 py-2.5">
                        <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Dibuat</p><p className="text-sm text-slate-700">{formatDateTime(selectedTicket.created_at)}</p></div>
                      </div>
                      {selectedTicket.created_by && (
                        <div className="flex items-start gap-3 py-2.5">
                          <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                          <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Created By</p><p className="text-sm text-slate-700">@{selectedTicket.created_by}</p></div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Foto */}
                  {selectedTicket.photo_url && (
                    <div className="px-4 py-3 border-b border-slate-100">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">Foto Ticket</p>
                      <img src={selectedTicket.photo_url} alt="foto" className="w-full max-h-36 object-cover rounded-xl border cursor-pointer hover:opacity-90" onClick={() => window.open(selectedTicket.photo_url!, '_blank')} />
                    </div>
                  )}

                  {/* Activity Logs */}
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">Activity Log ({activityLogs.length})</p>
                    <div className="space-y-2">
                      {logsLoading ? (
                        <div className="flex justify-center py-4"><div className="w-6 h-6 border-3 border-slate-200 border-t-red-500 rounded-full animate-spin"/></div>
                      ) : activityLogs.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-3">Belum ada aktivitas</p>
                      ) : activityLogs.map(log => (
                        <div key={log.id} className="rounded-xl p-3 border border-slate-100 bg-slate-50/60">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-800">{log.handler_name}</span>
                              <span className="text-[9px] font-semibold text-slate-500">{log.team_type}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${SVC_STATUS_COLORS[log.new_status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{log.new_status}</span>
                              <span className="text-[9px] text-slate-400">{formatDateTime(log.created_at)}</span>
                            </div>
                          </div>
                          {log.action_taken && <p className="text-[11px] text-blue-700 font-semibold">{log.action_taken}</p>}
                          {log.notes && <p className="text-xs text-slate-600 mt-0.5">{log.notes}</p>}
                          {log.photo_url && <img src={log.photo_url} alt="log" className="mt-1.5 max-h-24 rounded-lg border cursor-pointer" onClick={() => window.open(log.photo_url!, '_blank')} />}
                          {log.file_url && <a href={log.file_url} download className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-blue-600 hover:underline"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>{log.file_name || 'Download'}</a>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer actions */}
                <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap gap-2 flex-shrink-0">
                  <button onClick={() => exportToPDF(selectedTicket)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                    Print PDF
                  </button>
                  {currentUser?.role === 'admin' && selectedTicket.services_status === 'Waiting Approval' && (
                    <button onClick={() => { setApprovalTicket(selectedTicket); setApprovalAssignTo(''); setShowApprovalModal(true); }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white"
                      style={{ background: 'linear-gradient(135deg,#059669,#047857)' }}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                      Approve
                    </button>
                  )}
                  {currentUser?.role === 'admin' && (
                    <button onClick={() => { setDeleteTarget(selectedTicket); setDeleteConfirmText(''); setShowDeleteModal(true); setShowDetail(false); }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      Hapus
                    </button>
                  )}
                  <button onClick={() => { setShowDetail(false); setShowUpdateForm(false); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 ml-auto">
                    Tutup
                  </button>
                </div>
              </div>

              {/* RIGHT: Update form panel */}
              {showUpdateForm && (
                <div className="w-[300px] flex-shrink-0 border-l border-slate-100 bg-white flex flex-col overflow-hidden">
                  <div className="px-4 py-3 flex-shrink-0" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                    <h3 className="font-bold text-white text-sm">🔧 Update Services</h3>
                    <p className="text-red-200 text-[10px]">Handler: {currentUser?.full_name}</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    <div>
                      <label className="block text-[9px] font-bold mb-2 tracking-widest uppercase text-gray-400">Pilih Status *</label>
                      <div className="flex flex-col gap-1">
                        {SERVICES_STATUSES.filter(s => s !== 'Waiting Approval').map(s => {
                          const isSelected = newActivity.new_status === s;
                          return (
                            <button key={s} onClick={() => { setNewActivity({ ...newActivity, new_status: s }); setShowRepairSchedule(s === 'In Repair'); }}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border-2 font-semibold text-xs transition-all text-left ${isSelected ? 'text-white border-transparent' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
                              style={isSelected ? { background: STATUS_GRADIENTS[s]?.gradient || '#dc2626' } : {}}>
                              <span className="flex-1">{s}</span>
                              {s === 'In Repair' && <span className="text-[8px] opacity-70">→ Reminder</span>}
                              {isSelected && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {showRepairSchedule && (
                      <div className="rounded-lg p-3 border border-blue-200 bg-blue-50/80 space-y-2">
                        <p className="text-[9px] font-bold text-blue-700 uppercase tracking-widest">🔧 Est. Selesai Perbaikan</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className="block text-[9px] text-blue-600 font-bold mb-1">Tanggal *</label><input type="date" value={repairSchedule.due_date} onChange={e => setRepairSchedule({ ...repairSchedule, due_date: e.target.value })} className="w-full border border-blue-300 rounded-lg px-2 py-1.5 text-xs outline-none bg-white"/></div>
                          <div><label className="block text-[9px] text-blue-600 font-bold mb-1">Jam</label><input type="time" value={repairSchedule.due_time} onChange={e => setRepairSchedule({ ...repairSchedule, due_time: e.target.value })} className="w-full border border-blue-300 rounded-lg px-2 py-1.5 text-xs outline-none bg-white"/></div>
                        </div>
                        <input value={repairSchedule.notes} onChange={e => setRepairSchedule({ ...repairSchedule, notes: e.target.value })} className="w-full border border-blue-300 rounded-lg px-2 py-1.5 text-xs outline-none bg-white" placeholder="Detail perbaikan..."/>
                        <p className="text-[9px] text-blue-500">✨ Reminder otomatis + WA dibuat</p>
                      </div>
                    )}
                    <div>
                      <label className="block text-[9px] font-bold mb-1 tracking-widest uppercase text-gray-400">🔧 Action Taken *</label>
                      <input value={newActivity.action_taken} onChange={e => setNewActivity({ ...newActivity, action_taken: e.target.value })}
                        placeholder="Yang sudah dilakukan..." className="w-full rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-red-500/40"
                        style={{ background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(0,0,0,0.12)' }}/>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold mb-1 tracking-widest uppercase text-gray-400">📝 Notes</label>
                      <textarea value={newActivity.notes} onChange={e => setNewActivity({ ...newActivity, notes: e.target.value })}
                        rows={3} placeholder="Catatan detail..." className="w-full rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-red-500/40 resize-none"
                        style={{ background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(0,0,0,0.12)' }}/>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold mb-1 tracking-widest uppercase text-gray-400">📷 Foto Bukti</label>
                      <input type="file" accept="image/*" onChange={e => setNewActivity({ ...newActivity, photo: e.target.files?.[0] || null })}
                        className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-white file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-semibold file:bg-red-50 file:text-red-700"
                        style={{ borderColor: 'rgba(0,0,0,0.12)' }}/>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold mb-1 tracking-widest uppercase text-gray-400">📎 Lampiran</label>
                      <input type="file" accept=".pdf,.doc,.docx" onChange={e => setNewActivity({ ...newActivity, file: e.target.files?.[0] || null })}
                        className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-white file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-semibold file:bg-gray-50 file:text-gray-700"
                        style={{ borderColor: 'rgba(0,0,0,0.12)' }}/>
                    </div>
                    <button onClick={handleUpdateActivity} disabled={saving || !newActivity.action_taken.trim()}
                      className="w-full text-white py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 transition-all"
                      style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                      {saving ? '⏳ Menyimpan...' : newActivity.new_status === 'In Repair' ? '🔧 Update + Buat Reminder' : '💾 Simpan Update'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}


        {/* Approval Modal — redesigned per screenshot */}
        {showApprovalModal && approvalTicket && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9500] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" style={{ border: '2px solid rgba(234,88,12,0.25)' }}>
              {/* Orange header */}
              <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-xl">⏳</div>
                  <div>
                    <h3 className="font-black text-white text-base leading-tight">Ticket Approval</h3>
                    <p className="text-orange-100 text-xs mt-0.5">
                      {tickets.filter(t => t.services_status === 'Waiting Approval').length} ticket menunggu persetujuan
                    </p>
                  </div>
                </div>
                <button onClick={() => { setShowApprovalModal(false); setApprovalTicket(null); setApprovalAssignTo(''); }}
                  className="p-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-white transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>

              {/* Ticket card */}
              <div className="p-4">
                <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(255,247,237,0.8)', border: '1px solid rgba(234,88,12,0.15)' }}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🏢</span>
                      <span className="font-black text-slate-800 text-sm">{approvalTicket.project_name}</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border" style={{ background: '#fff7ed', color: '#ea580c', borderColor: '#fed7aa' }}>⏳ Waiting Approval</span>
                  </div>
                  {approvalTicket.address && (
                    <p className="text-xs text-orange-500 font-medium mb-1">⚠️ {approvalTicket.address}</p>
                  )}
                  {approvalTicket.issue_case && (
                    <p className="text-xs text-slate-600 mb-2">{approvalTicket.issue_case}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {approvalTicket.sales_name && (
                      <span className="flex items-center gap-1">👤 {approvalTicket.sales_name}</span>
                    )}
                    {approvalTicket.assign_name && (
                      <span className="flex items-center gap-1">🏢 {approvalTicket.assign_name}</span>
                    )}
                    {approvalTicket.product && (
                      <span className="flex items-center gap-1">🔲 {approvalTicket.product}</span>
                    )}
                  </div>
                  {approvalTicket.created_by && (
                    <p className="text-[10px] text-orange-500 font-semibold mt-2">
                      Dibuat oleh: {approvalTicket.created_by} · {formatDateTime(approvalTicket.created_at).split(',')[0]}
                    </p>
                  )}
                </div>

                {/* Separator */}
                <div className="border-t border-slate-100 mb-4" />

                {/* Assign ke Team PTS */}
                <div className="mb-4">
                  <label className="block text-xs font-bold mb-2 text-slate-600 flex items-center gap-1.5">
                    <span>🧑‍🔧</span> Assign ke Team Services:
                  </label>
                  <select
                    value={approvalAssignTo}
                    onChange={e => setApprovalAssignTo(e.target.value)}
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all text-slate-700 appearance-none cursor-pointer focus:ring-2 focus:ring-orange-400/40"
                    style={{ background: 'white', border: '1.5px solid rgba(0,0,0,0.14)' }}>
                    <option value="">Pilih anggota Team Services</option>
                    {teamMembers.map(m => <option key={m.id} value={m.full_name}>{m.full_name}</option>)}
                  </select>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleReject(approvalTicket)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(approvalTicket, approvalAssignTo || undefined)}
                    className="flex-[1.4] flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                    Approve
                  </button>
                </div>

                {/* Navigation for multiple pending tickets */}
                {tickets.filter(t => t.services_status === 'Waiting Approval').length > 1 && (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    {tickets.filter(t => t.services_status === 'Waiting Approval').map((t, i) => (
                      <button key={t.id}
                        onClick={() => { setApprovalTicket(t); setApprovalAssignTo(''); }}
                        className={`w-2 h-2 rounded-full transition-all ${approvalTicket.id === t.id ? 'bg-orange-500 scale-125' : 'bg-slate-300 hover:bg-slate-400'}`} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        {/* New Ticket Modal */}
        {showNewTicket && (
          <NewTicketModal
            currentUser={currentUser!}
            teamMembers={teamMembers}
            onClose={() => setShowNewTicket(false)}
            onSaved={() => { setShowNewTicket(false); fetchData(currentUser); }}
          />
        )}

        {/* Delete Modal */}
        {showDeleteModal && deleteTarget && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" style={{ border: '2px solid rgba(220,38,38,0.3)' }}>
              <h3 className="font-bold text-lg text-slate-800 mb-2">🗑️ Hapus Ticket?</h3>
              <p className="text-sm text-slate-600 mb-1 font-semibold">{deleteTarget.project_name}</p>
              <p className="text-xs text-red-600 font-medium mb-4 p-2 bg-red-50 rounded-lg">
                ⚠️ Ticket hanya dihapus dari database Team Services. Data di PTS tidak terpengaruh.
              </p>
              <p className="text-sm text-slate-600 mb-2">Ketik <strong className="text-red-600">HAPUS</strong> untuk konfirmasi:</p>
              <input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-red-500 outline-none mb-4"
                placeholder="Ketik HAPUS"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); setDeleteConfirmText(''); }}
                  className="flex-1 border border-slate-300 text-slate-700 py-2.5 rounded-xl font-semibold hover:bg-slate-50 text-sm">
                  Batal
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteConfirmText !== 'HAPUS'}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-semibold disabled:opacity-40 text-sm">
                  🗑️ Hapus
                </button>
              </div>
            </div>
          </div>
        )}

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
              {/* Bell notification — pending approval */}
              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => pendingApprovalCount > 0 ? (setApprovalTicket(tickets.find(t => t.services_status === 'Waiting Approval') ?? null), setApprovalAssignTo(''), setShowApprovalModal(true)) : undefined}
                  className="relative p-2 rounded-xl transition-all hover:bg-red-50 border-2 border-transparent hover:border-red-200"
                  title={pendingApprovalCount > 0 ? `${pendingApprovalCount} ticket menunggu approval` : 'Tidak ada ticket pending'}>
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                  </svg>
                  {pendingApprovalCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white animate-pulse"
                      style={{ background: '#ea580c' }}>
                      {pendingApprovalCount > 9 ? '9+' : pendingApprovalCount}
                    </span>
                  )}
                </button>
              )}
              {/* Approval button — admin only, when pending */}
              {currentUser?.role === 'admin' && pendingApprovalCount > 0 && (
                <button onClick={() => { setApprovalTicket(tickets.find(t => t.services_status === 'Waiting Approval') ?? null); setApprovalAssignTo(''); setShowApprovalModal(true); }}
                  className="relative flex items-center gap-1.5 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all"
                  style={{ background: 'linear-gradient(135deg,#ea580c,#c2410c)', boxShadow: '0 2px 8px rgba(234,88,12,0.35)' }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"/></svg>
                  Ticket Masuk
                  <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{pendingApprovalCount}</span>
                </button>
              )}
              {/* New Ticket button */}
              <button onClick={() => setShowNewTicket(true)}
                className="flex items-center gap-1.5 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all hover:scale-105 hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)', boxShadow: '0 4px 14px rgba(220,38,38,0.4)' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
                New Ticket
              </button>
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

          {/* Mini charts — 4 kolom 1 baris */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
            {/* Product donut chart */}
            {stats.productData.length > 0 && (
              <MiniDonutChart
                data={stats.productData}
                title="📦 Product"
                emptyMsg="Belum ada data product"
              />
            )}
            {/* Sales Division donut chart */}
            {stats.divData.length > 0 && (
              <MiniDonutChart
                data={stats.divData}
                title="🏷️ Sales Division"
                emptyMsg="Belum ada data divisi"
              />
            )}
          </div>

          {/* Ticket List */}
          <div ref={ticketListRef} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)' }}>
            {/* List header + search — same layout as Reminder Schedule */}
            <div className="px-5 py-3 border-b border-slate-100">
              {/* Row 1: Title + count + Refresh + Select */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-black text-slate-800">TICKET LIST</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: '#dc2626' }}>{filteredTickets.length}</span>
                <div className="flex items-center gap-2 ml-auto">
                  {currentUser?.role === 'admin' && (
                    <button onClick={() => { setSelectMode(m => !m); setSelectedIds(new Set()); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${selectMode ? 'bg-red-50 border-red-300 text-red-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      {selectMode ? '✕ Batal' : '☑ Select'}
                    </button>
                  )}
                  <button onClick={() => fetchData(currentUser)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-slate-100 border border-slate-200 text-slate-600 bg-white">
                    <svg className={`w-3.5 h-3.5 ${ticketsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </button>
                </div>
              </div>
              {/* Row 2: Search + Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input value={searchProject} onChange={e => setSearchProject(e.target.value)} placeholder="Cari project / issue..."
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none bg-gray-50 focus:bg-white transition-all" />
                </div>
                <div className="relative min-w-[150px]">
                  <input value={searchSales} onChange={e => setSearchSales(e.target.value)} placeholder="🔎 Cari sales..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none bg-gray-50 focus:bg-white transition-all" />
                </div>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-red-400 outline-none bg-gray-50 font-medium cursor-pointer">
                  <option value="All">All Status</option>
                  {SERVICES_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-red-400 outline-none bg-gray-50 font-medium cursor-pointer">
                  <option value="all">All Tahun</option>
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                {(filterStatus !== 'All' || handlerFilter || searchProject || searchSales) && (
                  <button onClick={() => { setFilterStatus('All'); setHandlerFilter(null); setSearchProject(''); setSearchSales(''); }}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 transition-all">
                    Reset ✕
                  </button>
                )}
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
                {/* Bulk delete bar */}
                {selectMode && selectedIds.size > 0 && (
                  <div className="flex items-center justify-between px-5 py-2.5 border-b border-red-200" style={{ background: 'rgba(220,38,38,0.06)' }}>
                    <span className="text-sm font-bold text-red-700">{selectedIds.size} ticket dipilih</span>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-500 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">Batal Pilih</button>
                      <button onClick={async () => {
                        if (!confirm(`Hapus ${selectedIds.size} ticket dari Services DB?`)) return;
                        for (const id of Array.from(selectedIds)) {
                          await supabase.from('activity_logs').delete().eq('ticket_id', id);
                          await supabase.from('tickets').delete().eq('id', id);
                        }
                        setSelectedIds(new Set()); setSelectMode(false);
                        fetchData(currentUser);
                      }} className="text-xs font-bold text-white px-4 py-1.5 rounded-lg" style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                        🗑️ Hapus {selectedIds.size}
                      </button>
                    </div>
                  </div>
                )}
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr style={{ background: 'linear-gradient(90deg,rgba(220,38,38,0.06),rgba(220,38,38,0.02))', borderBottom: '2px solid rgba(220,38,38,0.15)' }}>
                      {selectMode && currentUser?.role === 'admin' && (
                        <th className="px-3 py-3 w-10 border border-slate-100">
                          <input type="checkbox"
                            checked={selectedIds.size === filteredTickets.length && filteredTickets.length > 0}
                            onChange={() => setSelectedIds(prev =>
                              prev.size === filteredTickets.length ? new Set() : new Set(filteredTickets.map(t => t.id))
                            )}
                            className="w-4 h-4 rounded accent-red-600 cursor-pointer"/>
                        </th>
                      )}
                      {['NO', 'NAMA PROJECT', 'ISSUE', 'PRODUCT', 'SN UNIT', 'SALES', 'HANDLER', 'STATUS', 'TGL', 'AKSI'].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-[10px] font-black tracking-widest uppercase text-slate-400 border-r border-red-50/80 last:border-r-0">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map((t, idx) => (
                      <tr key={t.id}
                        className={`hover:bg-red-50/40 cursor-pointer transition-colors group border-b ${selectedIds.has(t.id) ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                        style={{ borderColor: 'rgba(0,0,0,0.05)' }}
                        onClick={() => openTicket(t)}>
                        {selectMode && currentUser?.role === 'admin' && (
                          <td className="px-3 py-3 border-r border-slate-100/50" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selectedIds.has(t.id)}
                              onChange={() => setSelectedIds(prev => { const n = new Set(prev); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })}
                              className="w-4 h-4 rounded accent-red-600 cursor-pointer"/>
                          </td>
                        )}
                        {/* NO */}
                        <td className="px-3 py-3 text-slate-400 font-semibold text-xs border border-slate-100 text-center">{idx + 1}</td>
                        {/* PROJECT */}
                        <td className="px-3 py-3 border-r border-slate-100/50 max-w-[160px]">
                          <p className="font-bold text-slate-800 group-hover:text-red-700 transition-colors text-sm leading-tight line-clamp-2">{t.project_name}</p>
                          {t.address && <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">📍 {t.address}</p>}
                        </td>
                        {/* ISSUE */}
                        <td className="px-3 py-3 border-r border-slate-100/50 max-w-[140px]">
                          <p className="text-sm font-medium text-slate-600 line-clamp-2">{t.issue_case}</p>
                          {t.description && <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{t.description}</p>}
                        </td>
                        {/* PRODUCT */}
                        <td className="px-3 py-3 border-r border-slate-100/50">
                          {t.product
                            ? <span className="inline-block px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">📦 {t.product}</span>
                            : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        {/* SN UNIT */}
                        <td className="px-3 py-3 border-r border-slate-100/50">
                          {t.sn_unit
                            ? <span className="text-xs font-mono text-slate-600">{t.sn_unit}</span>
                            : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        {/* SALES */}
                        <td className="px-3 py-3 border-r border-slate-100/50">
                          <p className="font-semibold text-slate-700 text-sm line-clamp-1">{t.sales_name || '—'}</p>
                          {t.sales_division && <p className="text-[10px] text-purple-500 font-semibold">{t.sales_division}</p>}
                        </td>
                        {/* HANDLER */}
                        <td className="px-3 py-3 border-r border-slate-100/50">
                          <p className="font-semibold text-slate-700 text-sm line-clamp-1">{t.assign_name || '—'}</p>
                          <p className="text-[10px] text-red-400 font-medium">Services</p>
                        </td>
                        {/* STATUS */}
                        <td className="px-3 py-3 border-r border-slate-100/50">
                          {t.services_status
                            ? <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[t.services_status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>{t.services_status}</span>
                            : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        {/* TANGGAL */}
                        <td className="px-3 py-3 border-r border-slate-100/50 whitespace-nowrap">
                          <p className="text-xs text-slate-500">{t.date || formatDateTime(t.created_at).split(',')[0]}</p>
                          <p className="text-[10px] text-slate-400">{formatDateTime(t.created_at).split(',')[1]?.trim()}</p>
                        </td>
                        {/* AKSI */}
                        <td className="px-3 py-3 border-r border-slate-100/50" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openTicket(t)} title="View" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                            </button>
                            <button onClick={() => exportToPDF(t)} title="Print PDF" className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-all">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                            </button>
                            {currentUser?.role === 'admin' && t.services_status === 'Waiting Approval' && (
                              <button onClick={() => { setApprovalTicket(t); setApprovalAssignTo(''); setShowApprovalModal(true); }} title="Approve" className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 transition-all animate-pulse">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                              </button>
                            )}
                            {currentUser?.role === 'admin' && (
                              <button onClick={() => { setDeleteTarget(t); setDeleteConfirmText(''); setShowDeleteModal(true); }} title="Hapus" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                  <span className="text-xs text-slate-400">{filteredTickets.length} ticket ditemukan</span>
                  <span className="text-xs text-slate-400">{filteredTickets.length} / {tickets.length} total</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scale-in { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
        @keyframes slide-in-right { from { opacity: 0; transform: translateX(32px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
