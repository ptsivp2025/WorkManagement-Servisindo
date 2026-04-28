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
  const [form, setForm] = useState({
    project_name: '', address: '', customer_phone: '', sales_name: '', sales_division: '',
    sn_unit: '', product: '', issue_case: '', description: '', assign_name: '',
    date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }),
    photo: null as File | null,
  });
  const f = (p: Partial<typeof form>) => setForm(prev => ({ ...prev, ...p }));
  const isAdmin = currentUser.role === 'admin';
  const inp = 'w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none bg-white';

  const handleSubmit = async () => {
    if (!form.project_name || !form.issue_case) { alert('Project name dan Issue wajib diisi!'); return; }
    if (isAdmin && !form.assign_name) { alert('Admin wajib assign ke handler!'); return; }
    setSaving(true);
    try {
      let photoUrl = '', photoName = '';
      if (form.photo) {
        const ext = form.photo.name.split('.').pop();
        const path = `svc-photos/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('ticket-files').upload(path, form.photo);
        if (!upErr) { const { data } = supabase.storage.from('ticket-files').getPublicUrl(path); photoUrl = data.publicUrl; photoName = form.photo.name; }
      }
      const payload = {
        project_name: form.project_name, address: form.address || null,
        customer_phone: form.customer_phone || null, sales_name: form.sales_name || null,
        sales_division: form.sales_division || null, sn_unit: form.sn_unit || null,
        product: form.product || null, issue_case: form.issue_case,
        description: form.description || null, assign_name: isAdmin ? form.assign_name : '',
        date: form.date, status: isAdmin ? 'Verifying Warranty' : 'Waiting Approval',
        services_status: isAdmin ? 'Verifying Warranty' : 'Waiting Approval',
        current_team: 'Team Services', created_by: currentUser.username,
        photo_url: photoUrl || null, photo_name: photoName || null,
      };
      // Insert ke Services DB
      await supabase.from('tickets').insert([payload]);
      // Notif WA ke admin jika non-admin
      if (!isAdmin) {
        const { data: admins } = await supabase.from('users').select('phone_number, full_name').eq('role', 'admin').not('phone_number', 'is', null).neq('phone_number', '');
        if (admins?.length) {
          const msg = [`🔔 *Request Ticket Baru — Servisindo*`, '━━━━━━━━━━━━━━━━━━',
            `📌 Project: ${form.project_name}`, `⚠️ Issue: ${form.issue_case}`,
            `👤 Dari: ${currentUser.full_name}`, '━━━━━━━━━━━━━━━━━━',
            'Buka platform Work Management Servisindo untuk approval.'].join('\n');
          await Promise.allSettled((admins as any[]).map((a: any) =>
            sendWA({ type: 'reminder_wa', target: a.phone_number, message: msg })));
        }
      }
      onSaved();
    } catch (e: any) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden" style={{ border: '2px solid rgba(220,38,38,0.3)' }}>
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
          <div><h2 className="font-black text-white text-lg">🎫 New Ticket</h2><p className="text-red-200 text-xs mt-0.5">Buat ticket baru untuk Team Services</p></div>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Nama Project *</label><input value={form.project_name} onChange={e => f({ project_name: e.target.value })} className={inp} placeholder="Nama project"/></div>
            <div className="col-span-2"><label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Issue Case *</label><input value={form.issue_case} onChange={e => f({ issue_case: e.target.value })} className={inp} placeholder="Masalah yang dilaporkan"/></div>
            <div className="col-span-2"><label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Deskripsi</label><textarea value={form.description} onChange={e => f({ description: e.target.value })} className={inp} rows={2} placeholder="Detail masalah..."/></div>
            <div><label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Product</label><input value={form.product} onChange={e => f({ product: e.target.value })} className={inp} placeholder="Nama produk"/></div>
            <div><label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">SN Unit</label><input value={form.sn_unit} onChange={e => f({ sn_unit: e.target.value })} className={inp} placeholder="Serial number"/></div>
            <div className="col-span-2"><label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Lokasi / Alamat</label><input value={form.address} onChange={e => f({ address: e.target.value })} className={inp} placeholder="Alamat lengkap"/></div>
            <div><label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Sales</label><input value={form.sales_name} onChange={e => f({ sales_name: e.target.value })} className={inp} placeholder="Nama sales"/></div>
            <div><label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">No. Customer / User</label><input value={form.customer_phone} onChange={e => f({ customer_phone: e.target.value })} className={inp} placeholder="No telepon / nama user"/></div>
            <div><label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Tanggal</label><input type="date" value={form.date} onChange={e => f({ date: e.target.value })} className={inp}/></div>
            {isAdmin && (
              <div><label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Assign To *</label>
                <select value={form.assign_name} onChange={e => f({ assign_name: e.target.value })} className={inp}>
                  <option value="">-- Pilih Handler --</option>
                  {teamMembers.map(m => <option key={m.id} value={m.full_name}>{m.full_name}</option>)}
                </select>
              </div>
            )}
            <div className="col-span-2"><label className="block text-xs font-bold mb-1 text-slate-600 tracking-widest uppercase">Foto Ticket</label>
              <input type="file" accept="image/*" onChange={e => f({ photo: e.target.files?.[0] || null })} className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-red-50 file:text-red-700 hover:file:bg-red-100"/>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-700 py-3 rounded-xl font-semibold hover:bg-slate-50 text-sm">Batal</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-[2] text-white py-3 rounded-xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
            {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
            {isAdmin ? '✅ Buat Ticket' : '📨 Submit Ticket'}
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
            if (!acc.find(l => l.id === log.id)) acc.push(log); return acc;
          }, [])
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
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
  const exportToPDF = (ticket: Ticket) => {
    const pd = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
    const svcSt = ticket.services_status||'-';
    const actRows = (ticket.activity_logs||[]).sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()).map((log,i)=>`
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

  // ── Approve ticket (Waiting Approval → Pending) ──────────────────────────
  const handleApprove = async (ticket: Ticket) => {
    setShowLoadingPopup(true);
    setLoadingMsg('Menyetujui ticket...');
    try {
      await supabasePTS.from('tickets').update({ services_status: 'Pending' }).eq('id', ticket.id);
      await supabasePTS.from('activity_logs').insert([{
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
        const { error: upErr } = await supabase.storage.from('ticket-files').upload(path, newActivity.file);
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('ticket-files').getPublicUrl(path);
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
            product:      selectedTicket.product ?? selectedTicket.sn_unit ?? '',
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

        {/* Ticket Detail Side Panel — Workflow di kiri */}
        {showDetail && selectedTicket && (
          <div className="fixed inset-0 z-[9000] flex">
            <div className="flex-1 bg-black/40" onClick={() => { setShowDetail(false); setShowUpdateForm(false); }} />
            {/* Outer container — side-by-side: workflow + detail (+ optional update form) */}
            <div className={`flex overflow-hidden shadow-2xl transition-all duration-200 ${showUpdateForm ? 'w-[860px]' : 'w-[580px]'}`} style={{ borderLeft: '3px solid #dc2626', maxHeight: '100vh' }}>

              {/* LEFT: Workflow Progress Column */}
              <div className="w-[120px] flex-shrink-0 bg-slate-50 border-r border-slate-100 flex flex-col overflow-hidden">
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

              {/* CENTER: Detail info */}
              <div className="flex-1 bg-white flex flex-col overflow-hidden min-w-0">
                {/* Panel header */}
                <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 flex-shrink-0" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/20 text-white">{selectedTicket.current_team || 'Team Services'}</span>
                      {selectedTicket.services_status && (
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${SVC_STATUS_COLORS[selectedTicket.services_status] || 'bg-white text-red-700 border-red-200'}`}>{selectedTicket.services_status}</span>
                      )}
                    </div>
                    <h3 className="font-black text-base text-white truncate">{selectedTicket.project_name}</h3>
                    {selectedTicket.address && <p className="text-white/70 text-xs mt-0.5 truncate">📍 {selectedTicket.address}</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    {(currentUser?.role === 'admin' || currentUser?.role === 'team') && selectedTicket.services_status !== 'Solved' && selectedTicket.services_status !== 'Waiting Approval' && (
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

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Info grid — termasuk customer/user dari PTS */}
                  <div className="grid grid-cols-2 gap-x-6">
                    <div>
                      <InfoLine label="Handler" value={selectedTicket.assign_name} />
                      <InfoLine label="Issue" value={selectedTicket.issue_case} />
                      {selectedTicket.product && <InfoLine label="Product" value={selectedTicket.product} />}
                      {selectedTicket.sn_unit && <InfoLine label="SN Unit" value={selectedTicket.sn_unit} />}
                    </div>
                    <div>
                      {/* Customer / User phone — dari PTS ticket */}
                      {selectedTicket.customer_phone && <InfoLine label="Customer / User" value={selectedTicket.customer_phone} />}
                      {selectedTicket.sales_name && <InfoLine label="Sales" value={`${selectedTicket.sales_name}${selectedTicket.sales_division ? ` (${selectedTicket.sales_division})` : ''}`} />}
                      <InfoLine label="Dibuat" value={formatDateTime(selectedTicket.created_at)} />
                      {selectedTicket.created_by && <InfoLine label="Created By" value={`@${selectedTicket.created_by}`} />}
                    </div>
                  </div>
                  {selectedTicket.description && <InfoLine label="Deskripsi" value={selectedTicket.description} />}

                  {/* Foto ticket — tampilkan dari PTS juga */}
                  {selectedTicket.photo_url && (
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">📸 Foto Ticket</p>
                      <img src={selectedTicket.photo_url} alt="foto" className="w-full max-h-36 object-cover rounded-xl border cursor-pointer hover:opacity-90"
                        onClick={() => window.open(selectedTicket.photo_url!, '_blank')} />
                    </div>
                  )}

                  {/* Activity Logs */}
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2">📋 Activity Log ({activityLogs.length})</p>
                    <div className="space-y-2">
                      {logsLoading ? (
                        <div className="flex justify-center py-4"><div className="w-6 h-6 border-3 border-slate-200 border-t-red-500 rounded-full animate-spin"/></div>
                      ) : activityLogs.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">Belum ada aktivitas</p>
                      ) : activityLogs.map(log => (
                        <div key={log.id} className="rounded-lg p-2.5 border border-gray-100 bg-gray-50/80">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-gray-800">{log.handler_name}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${log.team_type === 'Team Services' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{log.team_type}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${SVC_STATUS_COLORS[log.new_status] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>{log.new_status}</span>
                              <span className="text-[9px] text-gray-400">{formatDateTime(log.created_at)}</span>
                            </div>
                          </div>
                          {log.action_taken && <p className="text-[10px] text-blue-700 font-semibold">🔧 {log.action_taken}</p>}
                          {log.notes && <p className="text-xs text-gray-600">{log.notes}</p>}
                          {log.photo_url && <img src={log.photo_url} alt="log" className="mt-1.5 max-h-24 rounded-lg border cursor-pointer" onClick={() => window.open(log.photo_url!, '_blank')} />}
                          {log.file_url && <a href={log.file_url} download className="inline-block mt-1 text-[10px] font-bold text-blue-600 hover:underline">📄 {log.file_name || 'Download'}</a>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer actions — Print + Update + Approve + Close */}
                <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap gap-2 bg-gray-50/50 flex-shrink-0">
                  <button onClick={() => exportToPDF(selectedTicket)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>🖨️ Print PDF</button>
                  {(currentUser?.role === 'admin' || currentUser?.role === 'team') && selectedTicket.services_status !== 'Solved' && selectedTicket.services_status !== 'Waiting Approval' && (
                    <button onClick={() => setShowUpdateForm(!showUpdateForm)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${showUpdateForm ? 'bg-gray-200 text-gray-700' : 'text-white'}`}
                      style={showUpdateForm ? {} : { background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                      {showUpdateForm ? '✕ Tutup' : '➕ Update Status'}
                    </button>
                  )}
                  {currentUser?.role === 'admin' && selectedTicket.services_status === 'Waiting Approval' && (
                    <button onClick={() => handleApprove(selectedTicket)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white"
                      style={{ background: 'linear-gradient(135deg,#059669,#047857)' }}>✅ Approve</button>
                  )}
                  {currentUser?.role === 'admin' && (
                    <button onClick={() => { setDeleteTarget(selectedTicket); setDeleteConfirmText(''); setShowDeleteModal(true); setShowDetail(false); }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-red-200 text-red-600 hover:bg-red-50">🗑️ Hapus</button>
                  )}
                  <button onClick={() => { setShowDetail(false); setShowUpdateForm(false); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 bg-white">✕ Close</button>
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
        {/* New Ticket Modal */}
        {showNewTicket && (
          <NewTicketModal
            currentUser={currentUser!}
            teamMembers={teamMembers}
            onClose={() => setShowNewTicket(false)}
            onSaved={() => { setShowNewTicket(false); fetchData(currentUser); }}
          />
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
              {/* Approval button — admin only */}
              {currentUser?.role === 'admin' && pendingApprovalCount > 0 && (
                <button onClick={() => { setApprovalTicket(tickets.find(t => t.services_status === 'Waiting Approval') ?? null); setShowApprovalModal(true); }}
                  className="relative flex items-center gap-1.5 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all"
                  style={{ background: 'linear-gradient(135deg,#ea580c,#c2410c)', boxShadow: '0 2px 8px rgba(234,88,12,0.35)' }}>
                  🔧 Ticket Masuk
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
