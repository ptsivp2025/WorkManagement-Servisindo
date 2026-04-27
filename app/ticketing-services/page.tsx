'use client';

// ══════════════════════════════════════════════════════════════════════════════
// TICKETING SERVICES v2 — Platform Team Services (Servisindo)
// Revisi: table style sama PTS, flowchart di kiri detail, foto support,
// New Ticket seperti PTS, Print PDF, nama+telp user dari PTS DB,
// Admin Team Services assign ke anggota mereka sendiri, auto-update realtime
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

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

const SERVICES_STATUSES = [
  'Waiting Approval', 'Verifying Warranty', 'Analyzing', 'Void',
  'RMA Submitted', 'Waiting Part', 'In Repair', 'Backup Deployed',
  'Repaired Unit', 'Solved',
] as const;
type ServicesStatus = typeof SERVICES_STATUSES[number];

const WORKFLOW_ORDER: ServicesStatus[] = [
  'Verifying Warranty', 'Analyzing', 'Void', 'RMA Submitted',
  'Waiting Part', 'In Repair', 'Backup Deployed', 'Repaired Unit', 'Solved',
];

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
  'Pending':            'bg-yellow-50 text-yellow-700 border-yellow-200',
  'In Progress':        'bg-blue-50 text-blue-600 border-blue-200',
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
  sales_name?: string;
  sales_division?: string;
  issue_case: string;
  description?: string;
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
  photo_url?: string;
  photo_name?: string;
}

// ── Guest/User info dari PTS (untuk nama + telp user) ──────────────────────
interface PTSUser {
  id: string;
  username: string;
  full_name: string;
  phone_number?: string;
  sales_division?: string;
  role: string;
}

function formatDateTime(s: string) {
  if (!s) return '-';
  const d = new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z');
  if (isNaN(d.getTime())) return s;
  const jkt = new Date(d.getTime() + 7 * 3600000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(jkt.getUTCDate())}/${pad(jkt.getUTCMonth()+1)}/${jkt.getUTCFullYear()}, ${pad(jkt.getUTCHours())}:${pad(jkt.getUTCMinutes())}:${pad(jkt.getUTCSeconds())}`;
}

function getJakartaDateString() {
  const now = new Date();
  const jkt = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  return `${jkt.getFullYear()}-${String(jkt.getMonth()+1).padStart(2,'0')}-${String(jkt.getDate()).padStart(2,'0')}`;
}

// ── Donut Chart ──────────────────────────────────────────────────────────────
function MiniDonut({ data, total, title, onSliceClick, activeSlice }: {
  data: { name: string; value: number; color: string }[];
  total: number;
  title: string;
  onSliceClick?: (name: string) => void;
  activeSlice?: string | null;
}) {
  const [hov, setHov] = useState<number | null>(null);
  if (total === 0) return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)' }}>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
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
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">{title}</p>
      <div className="flex items-center gap-3">
        <svg width="120" height="120" viewBox="0 0 120 120" className="flex-shrink-0">
          {slices.map(s => s.isCircle
            ? <g key={s.i} onClick={() => onSliceClick?.(s.name)} style={{ cursor: onSliceClick ? 'pointer' : 'default' }}>
                <circle cx={cx} cy={cy} r={r} fill={s.color} opacity={hov === null || hov === s.i ? 1 : 0.45} />
                <circle cx={cx} cy={cy} r={ir} fill="white" />
              </g>
            : <path key={s.i} d={s.path} fill={s.color} opacity={hov === null || hov === s.i ? 1 : 0.45}
                style={{ cursor: onSliceClick ? 'pointer' : 'default', transition: 'opacity 0.15s', filter: hov === s.i || activeSlice === s.name ? `drop-shadow(0 0 4px ${s.color})` : 'none' }}
                onMouseEnter={() => setHov(s.i)} onMouseLeave={() => setHov(null)} onClick={() => onSliceClick?.(s.name)} />
          )}
          <text x="60" y="57" textAnchor="middle" fontSize="16" fontWeight="800" fill="#1e293b">{total}</text>
          <text x="60" y="70" textAnchor="middle" fontSize="7" fill="#94a3b8" fontWeight="600">TOTAL</text>
        </svg>
        <div className="flex flex-col gap-1.5 flex-1 min-w-0 max-h-[120px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {slices.map(s => (
            <div key={s.i} className="flex items-center gap-1.5 cursor-pointer rounded-lg px-1.5 py-0.5 transition-all"
              style={{ background: hov === s.i || activeSlice === s.name ? `${s.color}20` : 'transparent', outline: activeSlice === s.name ? `1px solid ${s.color}` : 'none' }}
              onMouseEnter={() => setHov(s.i)} onMouseLeave={() => setHov(null)} onClick={() => onSliceClick?.(s.name)}>
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

// ── Flowchart Sidebar (Services workflow) ────────────────────────────────────
function ServiceFlowchart({ currentStatus }: { currentStatus: string }) {
  const wfAll: ServicesStatus[] = [
    'Waiting Approval', 'Verifying Warranty', 'Analyzing', 'Void',
    'RMA Submitted', 'Waiting Part', 'In Repair', 'Backup Deployed',
    'Repaired Unit', 'Solved',
  ];
  const icons: Record<string, string> = {
    'Waiting Approval': '⏳', 'Verifying Warranty': '🔍', 'Analyzing': '🔬',
    'Void': '⛔', 'RMA Submitted': '📦', 'Waiting Part': '🕐',
    'In Repair': '🔧', 'Backup Deployed': '🖥️', 'Repaired Unit': '✅', 'Solved': '🏁',
  };
  const curIdx = wfAll.indexOf(currentStatus as ServicesStatus);
  return (
    <div className="flex flex-col items-start gap-0">
      {wfAll.map((step, i) => {
        const done = i < curIdx;
        const active = i === curIdx;
        const future = i > curIdx;
        const dotColor = done ? '#10b981' : active ? '#dc2626' : '#cbd5e1';
        const textColor = active ? '#dc2626' : done ? '#10b981' : '#94a3b8';
        return (
          <div key={step} className="flex items-start gap-2">
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 transition-all"
                style={{ background: dotColor, boxShadow: active ? `0 0 0 3px ${dotColor}30` : 'none', transform: active ? 'scale(1.15)' : 'scale(1)' }}>
                {done ? '✓' : icons[step] || (i + 1)}
              </div>
              {i < wfAll.length - 1 && (
                <div className="w-0.5 h-5 transition-all" style={{ background: done ? '#10b981' : '#e2e8f0' }} />
              )}
            </div>
            <div className="pb-1" style={{ paddingTop: '3px' }}>
              <span className="text-[10px] font-bold leading-tight" style={{ color: textColor }}>{step}</span>
              {active && <span className="ml-1 text-[8px] font-black text-red-600 uppercase tracking-widest">◀ NOW</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Export PDF (same as PTS style) ──────────────────────────────────────────
function exportToPDF(ticket: Ticket, activityLogs: ActivityLog[]) {
  const printDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const svcStatus = ticket.services_status || ticket.status;
  const statusColor = svcStatus === 'Solved' ? '#059669' : svcStatus === 'In Repair' ? '#2563eb' : svcStatus === 'Analyzing' ? '#7c3aed' : '#d97706';

  const actRows = [...activityLogs]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((log, idx) => {
      const ts = formatDateTime(log.created_at);
      const isSvc = log.team_type === 'Team Services';
      return `<tr style="background:${idx % 2 === 0 ? '#fff' : '#f8fafc'}">
        <td style="padding:8px 10px;border:1px solid #e2e8f0;width:120px;vertical-align:top;font-size:11px">
          <div style="color:#64748b">${ts}</div>
          <div style="margin-top:3px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;display:inline-block;background:${isSvc ? '#fef3c7' : '#eff6ff'};color:${isSvc ? '#92400e' : '#1d4ed8'}">${log.team_type || 'SVC'}</div>
        </td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;width:130px;vertical-align:top;font-size:12px">
          <div style="font-weight:700">${log.handler_name || '-'}</div>
          <div style="margin-top:4px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;display:inline-block;background:#f0fdf4;color:#166534">${log.new_status}</div>
        </td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;vertical-align:top">
          ${log.action_taken ? `<div style="font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:4px">🔧 ${log.action_taken}</div>` : ''}
          ${log.notes ? `<div style="font-size:12px;color:#1e293b;line-height:1.5;white-space:pre-line">${log.notes}</div>` : '<div style="color:#94a3b8;font-size:11px;font-style:italic">—</div>'}
          ${log.photo_url ? `<div style="margin-top:6px"><img src="${log.photo_url}" style="max-height:90px;border-radius:6px;border:1px solid #e2e8f0" alt="bukti"/></div>` : ''}
          ${log.file_url ? `<div style="margin-top:4px"><a href="${log.file_url}" style="font-size:11px;color:#2563eb;font-weight:600">📎 ${log.file_name || 'Download'}</a></div>` : ''}
        </td>
      </tr>`;
    }).join('');

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Report Services — ${ticket.project_name}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff;font-size:13px}.page{padding:24px 28px;max-width:940px;margin:0 auto}.header{background:linear-gradient(135deg,#dc2626,#991b1b);color:white;border-radius:12px;padding:16px 20px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-start}.section{border:1.5px solid #e2e8f0;border-radius:10px;margin-bottom:14px;overflow:hidden}.section-title{background:#f1f5f9;padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#475569;border-bottom:1px solid #e2e8f0}.grid2{display:grid;grid-template-columns:1fr 1fr}.grid2>*{border-right:1px solid #e2e8f0}.grid2>*:last-child{border-right:none}.info-box{padding:8px 12px;border-bottom:1px solid #e2e8f0}.info-box:last-child{border-bottom:none}.info-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin-bottom:2px}.info-value{font-size:12px;font-weight:600;color:#1e293b}table{width:100%;border-collapse:collapse}.footer{margin-top:16px;padding-top:10px;border-top:1.5px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8}@media print{.page{padding:14px 18px}button{display:none!important}}</style>
  </head><body><div class="page">
  <div class="header">
    <div>
      <h1 style="font-size:16px;font-weight:800;margin-bottom:3px">🔧 Report Perbaikan — Servisindo</h1>
      <p style="font-size:11px;opacity:.85">Ticket ID: ${ticket.id?.substring(0,8).toUpperCase()}</p>
      <span style="display:inline-block;margin-top:6px;padding:2px 12px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(255,255,255,0.2);color:white">SVC: ${svcStatus}</span>
    </div>
    <div style="text-align:right;font-size:11px;opacity:.85;line-height:1.8">
      <div><b>Dicetak:</b> ${printDate}</div>
      <div><b>Handler:</b> ${ticket.assign_name || '—'}</div>
      <div><b>Dibuat:</b> ${formatDateTime(ticket.created_at)}</div>
    </div>
  </div>
  <div class="section"><div class="section-title">🎫 Informasi Ticket</div><div class="grid2">
    <div>
      <div class="info-box"><div class="info-label">Nama Project</div><div class="info-value" style="font-size:14px;font-weight:800;color:#dc2626">${ticket.project_name}</div></div>
      <div class="info-box"><div class="info-label">Issue Case</div><div class="info-value">${ticket.issue_case}</div></div>
      <div class="info-box"><div class="info-label">Deskripsi</div><div class="info-value" style="font-weight:400;color:#475569">${ticket.description || '—'}</div></div>
    </div>
    <div>
      <div class="info-box"><div class="info-label">Product / Unit</div><div class="info-value">${ticket.product || '—'}</div></div>
      <div class="info-box"><div class="info-label">SN Unit</div><div class="info-value">${ticket.sn_unit || '—'}</div></div>
      <div class="info-box"><div class="info-label">Lokasi</div><div class="info-value">${ticket.address || '—'}</div></div>
    </div>
  </div></div>
  <div class="section"><div class="section-title">👤 Customer & Sales</div><div class="grid2">
    <div>
      <div class="info-box"><div class="info-label">Nama Customer / User</div><div class="info-value">${ticket.customer_phone || '—'}</div></div>
      <div class="info-box"><div class="info-label">Sales / Account</div><div class="info-value">${ticket.sales_name || '—'}</div></div>
    </div>
    <div>
      <div class="info-box"><div class="info-label">Divisi Sales</div><div class="info-value">${ticket.sales_division || '—'}</div></div>
      <div class="info-box"><div class="info-label">Status Services</div><div><span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${statusColor}22;color:${statusColor};border:1.5px solid ${statusColor}66">${svcStatus}</span></div></div>
    </div>
  </div></div>
  <div class="section" style="border-top:2px solid #fecdd3">
    <div class="section-title" style="background:#fff1f2;color:#9f1239;border-color:#fecdd3">📋 Activity Log — Riwayat Penanganan</div>
    ${actRows ? `<table><thead><tr style="background:#fff1f2"><th style="padding:8px 10px;font-size:10px;font-weight:700;text-align:left;color:#9f1239;border-bottom:1.5px solid #fecdd3;width:130px">Waktu</th><th style="padding:8px 10px;font-size:10px;font-weight:700;text-align:left;color:#9f1239;border-bottom:1.5px solid #fecdd3;width:140px">Handler & Status</th><th style="padding:8px 10px;font-size:10px;font-weight:700;text-align:left;color:#9f1239;border-bottom:1.5px solid #fecdd3">Action & Notes</th></tr></thead><tbody>${actRows}</tbody></table>` : '<div style="padding:16px;text-align:center;color:#94a3b8;font-size:12px">Belum ada activity log</div>'}
  </div>
  ${ticket.photo_url ? `<div class="section"><div class="section-title">📸 Foto Ticket</div><div style="padding:12px;text-align:center"><img src="${ticket.photo_url}" style="max-height:200px;max-width:100%;border-radius:8px;border:1.5px solid #e2e8f0" alt="foto"/></div></div>` : ''}
  <div class="footer"><div>🔧 Servisindo Multimedia Service Center — Ticket Services System</div><div>Dicetak: ${printDate} | Status: ${svcStatus}</div></div>
  </div></body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 300); }
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
  const [ptsUsers, setPtsUsers] = useState<PTSUser[]>([]);
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
    photo: null as File | null,
  });

  const [showRepairSchedule, setShowRepairSchedule] = useState(false);
  const [repairSchedule, setRepairSchedule] = useState({
    due_date: new Date(Date.now() + 7 * 24 * 3600000).toISOString().split('T')[0],
    due_time: '09:00',
    notes: '',
  });

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [showLoadingPopup, setShowLoadingPopup] = useState(false);

  // New Ticket
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newTicket, setNewTicket] = useState({
    project_name: '', address: '', customer_phone: '', sales_name: '',
    sales_division: '', sn_unit: '', product: '', issue_case: '',
    description: '', assign_name: '', date: getJakartaDateString(),
    photo: null as File | null,
  });

  // Approval modal
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalTicket, setApprovalTicket] = useState<Ticket | null>(null);

  // Select mode + delete
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Ticket | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [bulkConfirm, setBulkConfirm] = useState(false);

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
          setCurrentUser(user); setIsLoggedIn(true);
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
        localStorage.removeItem('svc_currentUser'); localStorage.removeItem('svc_loginTime');
        setIsLoggedIn(false); setCurrentUser(null);
      }
    };
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, []);

  // ── Fetch data ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async (user?: User | null) => {
    setTicketsLoading(true);
    try {
      const { data: ticketData } = await getSupabasePTS().from('tickets')
        .select('*')
        .or('current_team.eq.Team Services,services_status.not.is.null')
        .order('created_at', { ascending: false });
      setTickets((ticketData ?? []) as Ticket[]);
    } catch (e) { console.error('[fetchData tickets]', e); }

    try {
      const { data: members } = await getSupabase().from('users').select('*').order('full_name');
      setTeamMembers((members ?? []) as User[]);
    } catch { /* ignore */ }

    // Fetch PTS users untuk nama+telp user/sales
    try {
      const { data: ptsU } = await getSupabasePTS().from('users').select('id,username,full_name,phone_number,sales_division,role').order('full_name');
      setPtsUsers((ptsU ?? []) as PTSUser[]);
    } catch { /* ignore */ }

    setTimeout(() => setTicketsLoading(false), 300);
  }, []);

  // ── Realtime subscription (KEDUA DB) ─────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    const chPTS = getSupabasePTS().channel('svc-ticketing-pts-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        setTimeout(() => fetchData(currentUser), 400);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => {
        setTimeout(() => fetchData(currentUser), 400);
      })
      .subscribe();
    let chSvc: any = null;
    try {
      chSvc = getSupabase().channel('svc-ticketing-svc-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
          setTimeout(() => fetchData(currentUser), 600);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => {
          setTimeout(() => fetchData(currentUser), 600);
        })
        .subscribe();
    } catch { /* ignore */ }
    return () => {
      getSupabasePTS().removeChannel(chPTS);
      if (chSvc) try { getSupabase().removeChannel(chSvc); } catch { /* ignore */ }
    };
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
    try {
      // Ambil dari kedua DB, merge dan deduplicate
      const [{ data: ptsLogs }, { data: svcLogs }] = await Promise.allSettled([
        getSupabasePTS().from('activity_logs').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true }),
        getSupabase().from('activity_logs').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true }),
      ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : { data: [] }));

      const allLogs = [...(ptsLogs ?? []), ...(svcLogs ?? [])];
      const unique = allLogs.reduce((acc: ActivityLog[], log: any) => {
        if (!acc.find(l => l.id === log.id)) acc.push(log);
        return acc;
      }, []);
      unique.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setActivityLogs(unique);
    } catch {
      const { data } = await getSupabasePTS().from('activity_logs').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
      setActivityLogs((data ?? []) as ActivityLog[]);
    }
    setLogsLoading(false);
  };

  const openTicket = async (t: Ticket) => {
    setSelectedTicket(t); setShowDetail(true); setShowUpdateForm(false);
    await fetchLogs(t.id);
  };

  // ── Approve ──────────────────────────────────────────────────────────────
  const handleApprove = async (ticket: Ticket) => {
    setShowLoadingPopup(true); setLoadingMsg('Menyetujui ticket...');
    try {
      await getSupabasePTS().from('tickets').update({ services_status: 'Verifying Warranty' }).eq('id', ticket.id);
      await getSupabasePTS().from('activity_logs').insert([{
        ticket_id: ticket.id,
        handler_name: currentUser?.full_name ?? '',
        handler_username: currentUser?.username ?? '',
        action_taken: 'Ticket diterima oleh Team Services',
        notes: 'Ticket mulai diproses oleh Servisindo.',
        new_status: 'Verifying Warranty',
        team_type: 'Team Services',
        assigned_to_services: false,
        file_url: '', file_name: '', photo_url: '', photo_name: '',
        created_at: new Date().toISOString(),
      }]);
      await fetchData(currentUser);
      setShowApprovalModal(false); setApprovalTicket(null);
      if (selectedTicket?.id === ticket.id) {
        setSelectedTicket(t => t ? { ...t, services_status: 'Verifying Warranty' } : t);
        await fetchLogs(ticket.id);
      }
    } catch (e: any) { alert('Gagal approve: ' + e.message); }
    setLoadingMsg('✅ Ticket diterima!');
    setTimeout(() => setShowLoadingPopup(false), 1200);
  };

  // ── Update Activity ──────────────────────────────────────────────────────
  const handleUpdateActivity = async () => {
    if (!selectedTicket) return;
    if (!newActivity.action_taken.trim()) { alert('Action taken wajib diisi!'); return; }
    const isInRepair = newActivity.new_status === 'In Repair';
    if (isInRepair && !repairSchedule.due_date) { alert('Isi estimasi tanggal selesai!'); return; }

    setSaving(true); setShowLoadingPopup(true); setLoadingMsg('Menyimpan update...');

    let fileUrl = '', fileName = '', photoUrl = '', photoName = '';

    if (newActivity.file) {
      setLoadingMsg('Upload file...');
      const ext = newActivity.file.name.split('.').pop();
      const path = `svc-activity/${selectedTicket.id}-${Date.now()}.${ext}`;
      try {
        const { error } = await getSupabase().storage.from('ticket-files').upload(path, newActivity.file);
        if (!error) {
          const { data: urlData } = getSupabase().storage.from('ticket-files').getPublicUrl(path);
          fileUrl = urlData.publicUrl ?? ''; fileName = newActivity.file.name;
        }
      } catch { /* ignore */ }
    }

    if (newActivity.photo) {
      setLoadingMsg('Upload foto...');
      const photoPath = `svc-photos/${selectedTicket.id}-${Date.now()}_${newActivity.photo.name}`;
      try {
        const { error } = await getSupabase().storage.from('ticket-photos').upload(photoPath, newActivity.photo);
        if (!error) {
          const { data: urlData } = getSupabase().storage.from('ticket-photos').getPublicUrl(photoPath);
          photoUrl = urlData.publicUrl ?? ''; photoName = newActivity.photo.name;
        }
      } catch { /* ignore */ }
    }

    const logBase = {
      handler_name: currentUser?.full_name ?? '',
      handler_username: currentUser?.username ?? '',
      action_taken: newActivity.action_taken,
      notes: newActivity.notes,
      new_status: newActivity.new_status,
      team_type: 'Team Services',
      file_url: fileUrl, file_name: fileName,
      photo_url: photoUrl, photo_name: photoName,
      assigned_to_services: false,
      created_at: new Date().toISOString(),
    };

    try {
      await getSupabasePTS().from('activity_logs').insert([{ ...logBase, ticket_id: selectedTicket.id }]);
      await getSupabase().from('activity_logs').insert([{ ...logBase, ticket_id: selectedTicket.id }]);
      await getSupabasePTS().from('tickets').update({ services_status: newActivity.new_status }).eq('id', selectedTicket.id);
      try { await getSupabase().from('tickets').update({ services_status: newActivity.new_status }).eq('id', selectedTicket.id); } catch { /* ignore */ }

      if (isInRepair) {
        setLoadingMsg('Membuat Reminder Schedule otomatis...');
        try {
          const { error: remErr } = await getSupabase().from('reminders').insert([{
            project_name: selectedTicket.project_name,
            description: `[AUTO dari Ticketing] ${selectedTicket.issue_case}${selectedTicket.product ? ` | Product: ${selectedTicket.product}` : ''}`,
            assigned_to: currentUser?.username ?? '',
            assign_name: currentUser?.full_name ?? '',
            due_date: repairSchedule.due_date, due_time: repairSchedule.due_time,
            priority: 'high', status: 'pending', category: 'Perbaikan Unit',
            sales_name: selectedTicket.sales_name ?? '',
            address: selectedTicket.address ?? '',
            product: selectedTicket.product ?? selectedTicket.sn_unit ?? '',
            pic_name: selectedTicket.customer_phone ?? '',
            notes: repairSchedule.notes ? `${repairSchedule.notes} | Ticket ID: ${selectedTicket.id}` : `Auto dari Ticketing. Ticket ID: ${selectedTicket.id}`,
            created_by: currentUser?.username ?? 'system',
          }]);
          if (!remErr && currentUser?.phone_number) {
            await sendWA({ type: 'repair_schedule', target: currentUser.phone_number, message: `🔧 Jadwal Perbaikan\n${selectedTicket.project_name}\n${selectedTicket.issue_case}\nEst. Selesai: ${repairSchedule.due_date} ${repairSchedule.due_time}` });
          }
        } catch { /* ignore */ }
      }

      if (newActivity.new_status === 'Solved' && selectedTicket.customer_phone) {
        await sendWA({ type: 'services_solved', target: selectedTicket.customer_phone, message: `✅ Unit ${selectedTicket.project_name} selesai diperbaiki oleh Servisindo. Terima kasih! 🙏` });
      }

      setSelectedTicket(t => t ? { ...t, services_status: newActivity.new_status } : t);
      await fetchData(currentUser);
      await fetchLogs(selectedTicket.id);
      setNewActivity({ action_taken: '', notes: '', new_status: 'Verifying Warranty', file: null, photo: null });
      setShowRepairSchedule(false);
      setRepairSchedule({ due_date: new Date(Date.now() + 7 * 24 * 3600000).toISOString().split('T')[0], due_time: '09:00', notes: '' });
      setShowUpdateForm(false);
      setLoadingMsg('✅ Update berhasil!');
    } catch (e: any) { alert('Gagal update: ' + e.message); setShowLoadingPopup(false); }
    setSaving(false);
    setTimeout(() => setShowLoadingPopup(false), 1600);
  };

  // ── Create New Ticket (langsung dari Services) ───────────────────────────
  const handleCreateTicket = async () => {
    if (!newTicket.project_name || !newTicket.issue_case) { alert('Project name dan Issue case wajib diisi!'); return; }
    if (!newTicket.assign_name) { alert('Pilih handler!'); return; }
    try {
      setUploading(true); setShowLoadingPopup(true); setLoadingMsg('Menyimpan ticket...');
      let photoUrl = '', photoName = '';
      if (newTicket.photo) {
        setLoadingMsg('Upload foto...');
        const fn = `${Date.now()}_${newTicket.photo.name}`;
        const { error } = await getSupabase().storage.from('ticket-photos').upload(`photos/${fn}`, newTicket.photo);
        if (!error) {
          const { data } = getSupabase().storage.from('ticket-photos').getPublicUrl(`photos/${fn}`);
          photoUrl = data.publicUrl; photoName = newTicket.photo.name;
        }
      }
      // Insert ke Services DB
      const { data: svcTicket, error: svcErr } = await getSupabase().from('tickets').insert([{
        project_name: newTicket.project_name, address: newTicket.address || null,
        customer_phone: newTicket.customer_phone || null, sales_name: newTicket.sales_name || null,
        sales_division: newTicket.sales_division || null, sn_unit: newTicket.sn_unit || null,
        product: newTicket.product || null, issue_case: newTicket.issue_case,
        description: newTicket.description || null, assign_name: newTicket.assign_name,
        date: newTicket.date, status: 'In Progress', services_status: 'Verifying Warranty',
        current_team: 'Team Services', created_by: currentUser?.username || null,
        photo_url: photoUrl || null, photo_name: photoName || null,
      }]).select('id').single();

      if (svcErr) throw svcErr;

      // Mirror ke PTS DB juga agar bisa dilihat dari platform PTS
      if (svcTicket?.id) {
        await getSupabasePTS().from('tickets').insert([{
          id: svcTicket.id,
          project_name: newTicket.project_name, address: newTicket.address || null,
          customer_phone: newTicket.customer_phone || null, sales_name: newTicket.sales_name || null,
          sales_division: newTicket.sales_division || null, sn_unit: newTicket.sn_unit || null,
          product: newTicket.product || null, issue_case: newTicket.issue_case,
          description: newTicket.description || null, assign_name: newTicket.assign_name,
          date: newTicket.date, status: 'In Progress', services_status: 'Verifying Warranty',
          current_team: 'Team Services', created_by: currentUser?.username || null,
          photo_url: photoUrl || null, photo_name: photoName || null,
        }]).then(({ error }) => { if (error) console.warn('[Mirror PTS] ticket mirror failed:', error.message); });
      }

      setNewTicket({ project_name: '', address: '', customer_phone: '', sales_name: '', sales_division: '', sn_unit: '', product: '', issue_case: '', description: '', assign_name: '', date: getJakartaDateString(), photo: null });
      setShowNewTicket(false);
      await fetchData(currentUser);
      setLoadingMsg('✅ Ticket berhasil dibuat!');
      setTimeout(() => { setShowLoadingPopup(false); setUploading(false); }, 1500);
    } catch (err: any) { setShowLoadingPopup(false); setUploading(false); alert('Error: ' + err.message); }
  };

  // ── Delete Ticket ────────────────────────────────────────────────────────
  const handleDeleteTicket = async () => {
    if (!deleteTarget || deleteConfirmText !== 'HAPUS') return;
    try {
      setUploading(true); setShowLoadingPopup(true); setLoadingMsg('Menghapus ticket...');
      await getSupabase().from('activity_logs').delete().eq('ticket_id', deleteTarget.id);
      await getSupabasePTS().from('activity_logs').delete().eq('ticket_id', deleteTarget.id);
      await getSupabase().from('tickets').delete().eq('id', deleteTarget.id);
      await getSupabasePTS().from('tickets').delete().eq('id', deleteTarget.id);
      await fetchData(currentUser);
      setLoadingMsg('✅ Ticket dihapus!');
      setTimeout(() => { setShowLoadingPopup(false); setUploading(false); setShowDeleteModal(false); setDeleteTarget(null); setDeleteConfirmText(''); }, 1500);
    } catch (e: any) { setShowLoadingPopup(false); setUploading(false); alert('Error: ' + e.message); }
  };

  // ── Toggle select ────────────────────────────────────────────────────────
  const toggleSelectId = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleSelectAll = () => setSelectedIds(prev =>
    prev.size === filteredTickets.length ? new Set() : new Set(filteredTickets.map(t => t.id))
  );

  // ── Export Excel ─────────────────────────────────────────────────────────
  const exportToExcel = () => {
    const runExport = (XLSX: any) => {
      const border = { top: { style: 'thin', color: { rgb: 'D1D5DB' } }, bottom: { style: 'thin', color: { rgb: 'D1D5DB' } }, left: { style: 'thin', color: { rgb: 'D1D5DB' } }, right: { style: 'thin', color: { rgb: 'D1D5DB' } } };
      const hdrStyle = { font: { name: 'Arial', bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E3A5F' }, patternType: 'solid' }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border };
      const cellStyle = { font: { name: 'Arial', sz: 10 }, alignment: { vertical: 'center', wrapText: true }, border };
      const c = (v: any, s: object) => ({ v, s, t: typeof v === 'number' ? 'n' : 's' });
      const headers = ['No.', 'Project Name', 'Issue', 'Product', 'SN Unit', 'Sales', 'Handler', 'Status PTS', 'Status Services', 'Tanggal', 'Activity Log'];
      const data: any[][] = [[c('📋 TICKET REPORT — TEAM SERVICES', { font: { name: 'Arial', bold: true, sz: 14, color: { rgb: '1E3A5F' } }, alignment: { horizontal: 'left' } }), ...(new Array(headers.length - 1).fill({ v: '', s: cellStyle, t: 's' }))], new Array(headers.length).fill({ v: '', s: cellStyle, t: 's' }), headers.map(h => c(h, hdrStyle))];
      filteredTickets.forEach((t, idx) => {
        const rs = idx % 2 === 0 ? cellStyle : { ...cellStyle, fill: { fgColor: { rgb: 'EFF6FF' }, patternType: 'solid' } };
        data.push([c(idx + 1, { ...rs, alignment: { horizontal: 'center', vertical: 'center' } }), c(t.project_name || '-', rs), c(t.issue_case || '-', rs), c(t.product || '-', rs), c(t.sn_unit || '-', rs), c(t.sales_name || '-', rs), c(t.assign_name || '-', rs), c(t.status || '-', rs), c(t.services_status || '-', rs), c(t.date || '-', rs), c('', rs)]);
      });
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 26 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 10 }];
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '📋 Ticket Services');
      XLSX.writeFile(wb, `Ticket_Services_${new Date().toISOString().split('T')[0]}.xlsx`, { bookType: 'xlsx', type: 'binary', cellStyles: true });
    };
    if ((window as any).XLSX) runExport((window as any).XLSX);
    else {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => runExport((window as any).XLSX);
      document.head.appendChild(s);
    }
  };

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const svc = tickets.filter(t => t.services_status || t.current_team === 'Team Services');
    const counts: Record<string, number> = {};
    SERVICES_STATUSES.forEach(s => { counts[s] = svc.filter(t => t.services_status === s).length; });
    const total = svc.length;
    const active = svc.filter(t => t.services_status !== 'Solved').length;
    const solved = counts['Solved'] ?? 0;
    const waiting = counts['Waiting Approval'] ?? 0;
    const statusColors = ['#f97316','#0ea5e9','#8b5cf6','#64748b','#f59e0b','#f43f5e','#3b82f6','#6366f1','#14b8a6','#10b981'];
    const statusData = SERVICES_STATUSES.map((s, i) => ({ name: s, value: counts[s] ?? 0, color: statusColors[i] })).filter(d => d.value > 0);
    const handlerCounts: Record<string, number> = {};
    svc.forEach(t => { if (t.assign_name) handlerCounts[t.assign_name] = (handlerCounts[t.assign_name] ?? 0) + 1; });
    const hColors = ['#dc2626','#2563eb','#059669','#d97706','#7c3aed','#0891b2','#db2777','#65a30d'];
    const handlerData = Object.entries(handlerCounts).map(([name, value], i) => ({ name, value, color: hColors[i % hColors.length] }));
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
      let matchStatus = filterStatus === 'All' || t.services_status === filterStatus;
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
  const canAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  // ── Find PTS user info ───────────────────────────────────────────────────
  const getPTSUser = (createdBy?: string | null) => {
    if (!createdBy) return null;
    return ptsUsers.find(u => u.username === createdBy) ?? null;
  };

  // ── Loading / Login ──────────────────────────────────────────────────────
  if (initializing) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundImage: 'url(/SVC_Background.png)', backgroundSize: 'cover' }}>
      <div className="bg-white/90 backdrop-blur-md p-8 rounded-2xl shadow-2xl">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-red-600 rounded-full animate-spin mx-auto" />
        <p className="mt-4 font-bold text-slate-700 text-center">Loading...</p>
      </div>
    </div>
  );

  if (!isLoggedIn) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundImage: 'url(/SVC_Background.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} />
      <div className="relative z-10 bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-8 w-full max-w-md" style={{ border: '1.5px solid rgba(220,38,38,0.25)' }}>
        <div className="flex justify-center mb-5">
          <div className="bg-white rounded-2xl px-6 py-3 shadow-lg" style={{ border: '2px solid rgba(220,38,38,0.15)' }}>
            <img src="/logo-servisindo.png" alt="Servisindo" style={{ height: '42px', width: 'auto', filter: 'none' }} />
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
    <div className="min-h-screen flex flex-col relative" style={{ backgroundImage: 'url(/SVC_Background.png)', backgroundSize: 'cover', backgroundAttachment: 'fixed' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* Loading popup */}
        {showLoadingPopup && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000]">
            <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4" style={{ border: '2px solid rgba(220,38,38,0.3)' }}>
              <div className="flex flex-col items-center">
                {loadingMsg.includes('✅') ? <div className="text-5xl mb-4 animate-bounce">✅</div> : <div className="relative w-14 h-14 mb-4"><div className="absolute inset-0 rounded-full border-4 border-slate-200" /><div className="absolute inset-0 rounded-full border-4 border-red-600 border-t-transparent animate-spin" /></div>}
                <p className="text-lg font-bold text-slate-800 text-center">{loadingMsg}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── TICKET DETAIL SIDE PANEL ── */}
        {showDetail && selectedTicket && (
          <div className="fixed inset-0 z-[9000] flex">
            <div className="flex-1 bg-black/40" onClick={() => { setShowDetail(false); setShowUpdateForm(false); }} />

            {/* Layout: flowchart kiri + detail kanan */}
            <div className="flex flex-row max-w-3xl w-full bg-transparent">

              {/* KIRI: Flowchart */}
              <div className="w-52 flex-shrink-0 bg-white/95 flex flex-col overflow-hidden" style={{ borderLeft: '2px solid #dc2626', borderRight: '1px solid rgba(220,38,38,0.15)' }}>
                <div className="px-4 py-3 border-b border-slate-100" style={{ background: 'linear-gradient(135deg,#991b1b,#7f1d1d)' }}>
                  <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest">Workflow Services</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <ServiceFlowchart currentStatus={selectedTicket.services_status || selectedTicket.status} />
                </div>
              </div>

              {/* KANAN: Detail panel */}
              <div className="flex-1 bg-white flex flex-col overflow-hidden shadow-2xl" style={{ borderLeft: '1px solid rgba(0,0,0,0.06)' }}>
                {/* Panel header */}
                <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[selectedTicket.status] ?? 'bg-white/20 text-white border-white/30'}`}>PTS: {selectedTicket.status}</span>
                      {selectedTicket.services_status && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[selectedTicket.services_status] ?? 'bg-white/20 text-white border-white/30'}`}>SVC: {selectedTicket.services_status}</span>}
                    </div>
                    <h3 className="font-black text-base text-white truncate">{selectedTicket.project_name}</h3>
                    <p className="text-white/70 text-xs mt-0.5">{selectedTicket.issue_case}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    {(currentUser?.role === 'admin' || currentUser?.role === 'team') && selectedTicket.services_status !== 'Solved' && selectedTicket.services_status !== 'Waiting Approval' && (
                      <button onClick={() => setShowUpdateForm(v => !v)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/20 text-white hover:bg-white/30 transition-all">
                        {showUpdateForm ? 'Tutup' : '✍️ Update'}
                      </button>
                    )}
                    {selectedTicket.services_status === 'Waiting Approval' && (
                      <button onClick={() => { setApprovalTicket(selectedTicket); setShowApprovalModal(true); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-400 text-white hover:bg-orange-500 transition-all">
                        ✅ Approve
                      </button>
                    )}
                    <button onClick={() => exportToPDF(selectedTicket, activityLogs)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/20 text-white hover:bg-white/30 transition-all">
                      🖨️
                    </button>
                    <button onClick={() => { setShowDetail(false); setShowUpdateForm(false); }}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {/* Update Form */}
                  {showUpdateForm && (
                    <div className="p-5 border-b border-slate-100" style={{ background: 'rgba(220,38,38,0.03)' }}>
                      <h4 className="font-bold text-slate-800 text-sm mb-3">Update Status Services</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Status Baru</label>
                          <select value={newActivity.new_status}
                            onChange={e => { const s = e.target.value as ServicesStatus; setNewActivity({ ...newActivity, new_status: s }); setShowRepairSchedule(s === 'In Repair'); }}
                            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-500 outline-none bg-white font-semibold">
                            {SERVICES_STATUSES.filter(s => s !== 'Waiting Approval').map(s => (
                              <option key={s} value={s}>{s === 'In Repair' ? '🔧 ' : s === 'Solved' ? '✅ ' : ''}{s}{s === 'In Repair' ? ' → Auto Reminder' : ''}</option>
                            ))}
                          </select>
                        </div>
                        {showRepairSchedule && (
                          <div className="bg-blue-50 rounded-xl p-3 border border-blue-200 space-y-2">
                            <p className="text-xs font-bold text-blue-700">🔧 In Repair — Auto Reminder</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold mb-1 text-blue-600 uppercase tracking-widest">Est. Selesai *</label>
                                <input type="date" value={repairSchedule.due_date} onChange={e => setRepairSchedule({ ...repairSchedule, due_date: e.target.value })} className="w-full border border-blue-300 rounded-lg px-2.5 py-2 text-sm outline-none bg-white" />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold mb-1 text-blue-600 uppercase tracking-widest">Jam</label>
                                <input type="time" value={repairSchedule.due_time} onChange={e => setRepairSchedule({ ...repairSchedule, due_time: e.target.value })} className="w-full border border-blue-300 rounded-lg px-2.5 py-2 text-sm outline-none bg-white" />
                              </div>
                            </div>
                            <input value={repairSchedule.notes} onChange={e => setRepairSchedule({ ...repairSchedule, notes: e.target.value })}
                              className="w-full border border-blue-300 rounded-lg px-2.5 py-2 text-sm outline-none" placeholder="Catatan perbaikan..." />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Action Taken *</label>
                          <input value={newActivity.action_taken} onChange={e => setNewActivity({ ...newActivity, action_taken: e.target.value })}
                            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-500 outline-none" placeholder="Yang sudah dilakukan..." />
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Catatan</label>
                          <textarea value={newActivity.notes} onChange={e => setNewActivity({ ...newActivity, notes: e.target.value })}
                            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-500 outline-none resize-none" rows={2} placeholder="Catatan tambahan..." />
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">📷 Foto Bukti</label>
                          <input type="file" accept="image/jpeg,image/jpg,image/png" onChange={e => setNewActivity({ ...newActivity, photo: e.target.files?.[0] ?? null })}
                            className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-red-50 file:text-red-700 hover:file:bg-red-100" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1 text-slate-500 tracking-widest uppercase">Lampiran PDF</label>
                          <input type="file" accept=".pdf,.doc,.docx" onChange={e => setNewActivity({ ...newActivity, file: e.target.files?.[0] ?? null })}
                            className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100" />
                        </div>
                        <button onClick={handleUpdateActivity} disabled={saving}
                          className="w-full text-white py-3 rounded-xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
                          style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                          {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                          {newActivity.new_status === 'In Repair' ? '🔧 Update + Buat Reminder' : '💾 Simpan Update'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Ticket Info */}
                  <div className="p-5 space-y-4">
                    {/* User/Customer info dari PTS */}
                    {(() => {
                      const ptsUser = getPTSUser(selectedTicket.created_by);
                      const customerInfo = selectedTicket.customer_phone;
                      return (
                        <div className="rounded-xl p-3 border" style={{ background: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.2)' }}>
                          <p className="text-[10px] font-bold tracking-widest uppercase text-indigo-500 mb-2">👤 Info Customer / User</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-[9px] text-slate-400 font-bold uppercase">Nama / Kontak</p>
                              <p className="text-sm font-semibold text-slate-800">{customerInfo || '-'}</p>
                            </div>
                            {ptsUser && (
                              <div>
                                <p className="text-[9px] text-slate-400 font-bold uppercase">Dibuat oleh (PTS)</p>
                                <p className="text-sm font-semibold text-slate-800">{ptsUser.full_name}</p>
                                {ptsUser.phone_number && <p className="text-xs text-slate-500 mt-0.5">📱 {ptsUser.phone_number}</p>}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['Sales', selectedTicket.sales_name ?? '-'],
                        ['Divisi', selectedTicket.sales_division ?? '-'],
                        ['Handler / Assigned', selectedTicket.assign_name],
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

                    {selectedTicket.description && (
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-1">Deskripsi</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedTicket.description}</p>
                      </div>
                    )}

                    {selectedTicket.address && (
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-1">Lokasi</p>
                        <p className="text-sm text-slate-700">{selectedTicket.address}</p>
                      </div>
                    )}

                    {/* Foto awal ticket */}
                    {selectedTicket.photo_url && (
                      <div className="rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-2">📸 Foto Ticket</p>
                        <img src={selectedTicket.photo_url} alt="foto ticket" className="w-full max-h-48 object-cover rounded-xl border cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(selectedTicket.photo_url!, '_blank')} />
                      </div>
                    )}

                    {/* Activity Logs */}
                    <div>
                      <p className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-3">📋 Activity Log ({activityLogs.length})</p>
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
                              <div key={log.id} className="rounded-xl p-3 border" style={{ background: isSvc ? 'rgba(220,38,38,0.04)' : 'rgba(37,99,235,0.04)', borderColor: isSvc ? 'rgba(220,38,38,0.15)' : 'rgba(37,99,235,0.15)' }}>
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                  <span className="text-xs font-bold" style={{ color: isSvc ? '#dc2626' : '#2563eb' }}>{log.handler_name} · {isSvc ? '🔧 Services' : '🏗️ PTS'}</span>
                                  <span className="text-[10px] text-slate-400 flex-shrink-0">{formatDateTime(log.created_at)}</span>
                                </div>
                                {log.action_taken && <p className="text-sm font-semibold text-slate-800">{log.action_taken}</p>}
                                {log.notes && <p className="text-xs text-slate-500 mt-1">{log.notes}</p>}
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[log.new_status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>→ {log.new_status}</span>
                                  {log.file_url && <a href={log.file_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold text-blue-600 hover:underline">📎 {log.file_name || 'File'}</a>}
                                </div>
                                {log.photo_url && (
                                  <img src={log.photo_url} alt="bukti" className="mt-2 max-h-28 rounded-lg border cursor-pointer hover:opacity-80"
                                    onClick={() => window.open(log.photo_url!, '_blank')} />
                                )}
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
          </div>
        )}

        {/* Approval Modal */}
        {showApprovalModal && approvalTicket && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9500] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" style={{ border: '2px solid rgba(220,38,38,0.3)' }}>
              <h3 className="font-bold text-lg text-slate-800 mb-2">Approve & Assign Ticket</h3>
              <p className="text-sm text-slate-600 mb-4">Setujui ticket <strong>{approvalTicket.project_name}</strong> dan assign ke anggota Team Services:</p>
              <div className="mb-4">
                <label className="block text-xs font-bold mb-1 text-slate-600 uppercase tracking-widest">Assign ke Handler</label>
                <select value={approvalTicket.assign_name} onChange={e => setApprovalTicket({ ...approvalTicket, assign_name: e.target.value })}
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-400 bg-white">
                  <option value="">— Pilih Anggota Team Services —</option>
                  {teamMembers.map(m => <option key={m.id} value={m.full_name}>{m.full_name}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowApprovalModal(false); setApprovalTicket(null); }} className="flex-1 border border-slate-300 text-slate-700 py-2.5 rounded-xl font-semibold hover:bg-slate-50">Batal</button>
                <button onClick={async () => {
                  if (!approvalTicket.assign_name) { alert('Pilih handler terlebih dahulu!'); return; }
                  // Update assign_name juga
                  setShowLoadingPopup(true); setLoadingMsg('Menerima ticket...');
                  try {
                    await getSupabasePTS().from('tickets').update({ services_status: 'Verifying Warranty', assign_name: approvalTicket.assign_name }).eq('id', approvalTicket.id);
                    await getSupabasePTS().from('activity_logs').insert([{ ticket_id: approvalTicket.id, handler_name: currentUser?.full_name ?? '', handler_username: currentUser?.username ?? '', action_taken: `Ticket diterima dan di-assign ke ${approvalTicket.assign_name}`, notes: '', new_status: 'Verifying Warranty', team_type: 'Team Services', assigned_to_services: false, file_url: '', file_name: '', photo_url: '', photo_name: '', created_at: new Date().toISOString() }]);
                    await fetchData(currentUser);
                    setShowApprovalModal(false); setApprovalTicket(null);
                  } catch (e: any) { alert('Gagal: ' + e.message); }
                  setLoadingMsg('✅ Ticket diterima!');
                  setTimeout(() => setShowLoadingPopup(false), 1200);
                }} className="flex-1 text-white py-2.5 rounded-xl font-bold" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                  ✅ Terima & Assign
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Modal */}
        {showDeleteModal && deleteTarget && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full p-6" style={{ border: '2px solid rgba(220,38,38,0.5)' }}>
              <div className="flex items-center gap-3 mb-4"><span className="text-3xl">🗑️</span><div><h3 className="text-lg font-bold text-slate-800">Hapus Ticket</h3><p className="text-xs text-slate-500">{deleteTarget.project_name} · {deleteTarget.issue_case}</p></div></div>
              <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', color: '#b91c1c' }}>⚠️ Tindakan ini tidak dapat dibatalkan. Ticket dan semua activity log akan dihapus permanen dari KEDUA database.</div>
              <div className="mb-4">
                <label className="block text-sm font-bold mb-1 text-slate-700">Ketik <span className="font-mono bg-red-100 text-red-700 px-1 rounded">HAPUS</span> untuk konfirmasi</label>
                <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="Ketik HAPUS di sini..." className="w-full rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-red-500 outline-none" style={{ border: '2px solid rgba(220,38,38,0.3)' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleDeleteTicket} disabled={deleteConfirmText !== 'HAPUS' || uploading} className="bg-gradient-to-r from-red-600 to-red-800 text-white py-2.5 rounded-xl font-bold disabled:opacity-40 disabled:cursor-not-allowed">🗑️ Hapus Permanen</button>
                <button onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); setDeleteConfirmText(''); }} className="bg-slate-100 text-slate-700 py-2.5 rounded-xl font-bold">Batal</button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Delete Confirm */}
        {bulkConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" style={{ border: '2px solid rgba(220,38,38,0.4)' }}>
              <h3 className="font-bold text-lg mb-2">Hapus {selectedIds.size} Ticket?</h3>
              <p className="text-sm text-slate-600 mb-5">Tindakan ini tidak dapat dibatalkan.</p>
              <div className="flex gap-3">
                <button onClick={() => setBulkConfirm(false)} className="flex-1 border-2 border-slate-300 text-slate-700 py-2.5 rounded-xl font-bold">Batal</button>
                <button onClick={async () => {
                  setBulkConfirm(false);
                  const ids = Array.from(selectedIds);
                  for (const id of ids) {
                    await getSupabase().from('activity_logs').delete().eq('ticket_id', id);
                    await getSupabasePTS().from('activity_logs').delete().eq('ticket_id', id);
                    await getSupabase().from('tickets').delete().eq('id', id);
                    await getSupabasePTS().from('tickets').delete().eq('id', id);
                  }
                  setSelectedIds(new Set()); setSelectMode(false);
                  await fetchData(currentUser);
                }} className="flex-[2] bg-gradient-to-r from-red-600 to-red-700 text-white py-2.5 rounded-xl font-bold">🗑️ Hapus Permanen</button>
              </div>
            </div>
          </div>
        )}

        {/* New Ticket Modal */}
        {showNewTicket && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) setShowNewTicket(false); }}>
            <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-2xl my-4 overflow-hidden" style={{ border: '1.5px solid rgba(220,38,38,0.25)' }}>
              <div className="px-8 py-6" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">🔧 Buat Ticket Services Baru</h2>
                    <p className="text-red-200/80 text-xs mt-1">Ticket langsung masuk sebagai Services · Verifying Warranty</p>
                  </div>
                  <button onClick={() => setShowNewTicket(false)} className="bg-white/15 hover:bg-white/25 text-white p-2 rounded-lg transition-all">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
              <div className="p-8 space-y-4 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold mb-1.5 tracking-widest uppercase text-slate-400">Project Name *</label>
                    <input type="text" value={newTicket.project_name} onChange={e => setNewTicket({ ...newTicket, project_name: e.target.value })}
                      placeholder="Nama project" className="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/40 bg-white" style={{ border: '1px solid rgba(0,0,0,0.12)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5 tracking-widest uppercase text-slate-400">Assign ke Handler *</label>
                    <select value={newTicket.assign_name} onChange={e => setNewTicket({ ...newTicket, assign_name: e.target.value })}
                      className="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/40 bg-white appearance-none" style={{ border: '1px solid rgba(0,0,0,0.12)' }}>
                      <option value="">— Pilih Handler —</option>
                      {teamMembers.map(m => <option key={m.id} value={m.full_name}>{m.full_name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold mb-1.5 tracking-widest uppercase text-slate-400">Issue Case * (maks 4 kata)</label>
                    <input type="text" value={newTicket.issue_case}
                      onChange={e => { const v = e.target.value; const w = v.trim().split(/\s+/).filter(Boolean); if (w.length < 4 || (w.length === 4 && !v.endsWith(' '))) setNewTicket({ ...newTicket, issue_case: v }); }}
                      placeholder="Not Working, Overheating, dll" className="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/40 bg-white" style={{ border: '1px solid rgba(0,0,0,0.12)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5 tracking-widest uppercase text-slate-400">Product / Brand</label>
                    <input type="text" value={newTicket.product} onChange={e => setNewTicket({ ...newTicket, product: e.target.value })}
                      placeholder="Panasonic PT-MZ682, dll" className="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/40 bg-white" style={{ border: '1px solid rgba(0,0,0,0.12)' }} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold mb-1.5 tracking-widest uppercase text-slate-400">SN Unit</label>
                    <input type="text" value={newTicket.sn_unit} onChange={e => setNewTicket({ ...newTicket, sn_unit: e.target.value })}
                      placeholder="SN12345678" className="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/40 bg-white" style={{ border: '1px solid rgba(0,0,0,0.12)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5 tracking-widest uppercase text-slate-400">Nama & Telepon Customer</label>
                    <input type="text" value={newTicket.customer_phone} onChange={e => setNewTicket({ ...newTicket, customer_phone: e.target.value })}
                      placeholder="Adi - 08xx-xxxx" className="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/40 bg-white" style={{ border: '1px solid rgba(0,0,0,0.12)' }} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold mb-1.5 tracking-widest uppercase text-slate-400">Sales / Account</label>
                    <input type="text" value={newTicket.sales_name} onChange={e => setNewTicket({ ...newTicket, sales_name: e.target.value })}
                      placeholder="Nama sales" className="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/40 bg-white" style={{ border: '1px solid rgba(0,0,0,0.12)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5 tracking-widest uppercase text-slate-400">Alamat / Lokasi</label>
                    <input type="text" value={newTicket.address} onChange={e => setNewTicket({ ...newTicket, address: e.target.value })}
                      placeholder="Alamat lengkap" className="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/40 bg-white" style={{ border: '1px solid rgba(0,0,0,0.12)' }} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1.5 tracking-widest uppercase text-slate-400">Deskripsi Masalah</label>
                  <textarea value={newTicket.description} onChange={e => setNewTicket({ ...newTicket, description: e.target.value })} rows={3}
                    placeholder="Detail masalah yang dilaporkan..." className="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/40 resize-none bg-white" style={{ border: '1px solid rgba(0,0,0,0.12)' }} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1.5 tracking-widest uppercase text-slate-400">📸 Foto Ticket (opsional)</label>
                  <input type="file" accept="image/*" onChange={e => setNewTicket({ ...newTicket, photo: e.target.files?.[0] || null })}
                    className="w-full border rounded-xl px-4 py-2.5 bg-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100 text-sm" style={{ borderColor: 'rgba(0,0,0,0.12)' }} />
                  {newTicket.photo && <p className="text-xs text-green-600 font-semibold mt-1">✓ {newTicket.photo.name}</p>}
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowNewTicket(false)} className="flex-1 py-3 rounded-xl font-semibold text-sm text-slate-500 bg-slate-50 border border-slate-200">Batal</button>
                  <button onClick={handleCreateTicket} disabled={uploading}
                    className="flex-1 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)', boxShadow: '0 4px 14px rgba(220,38,38,0.35)' }}>
                    {uploading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {uploading ? 'Menyimpan...' : '💾 Buat Ticket'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md" style={{ borderBottom: '2.5px solid #dc2626' }}>
          <div className="max-w-[1600px] mx-auto px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>🔧</div>
              <div>
                <h1 className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-red-800">Ticket Troubleshooting</h1>
                <p className="text-xs text-slate-400 font-medium">Team Services · Servisindo</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {pendingApprovalCount > 0 && (
                <button onClick={() => { setApprovalTicket(tickets.find(t => t.services_status === 'Waiting Approval') ?? null); setShowApprovalModal(true); }}
                  className="relative flex items-center gap-1.5 text-white text-xs font-bold px-3.5 py-2 rounded-xl"
                  style={{ background: 'linear-gradient(135deg,#ea580c,#c2410c)', boxShadow: '0 2px 8px rgba(234,88,12,0.35)' }}>
                  🔧 Ticket Masuk
                  <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{pendingApprovalCount}</span>
                </button>
              )}
              {canAdmin && (
                <button onClick={() => { setSelectMode(m => !m); setSelectedIds(new Set()); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${selectMode ? 'bg-red-50 border-red-300 text-red-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {selectMode ? '✕ Batal' : '☑ Select'}
                </button>
              )}
              <button onClick={() => fetchData(currentUser)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 bg-white">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Refresh
              </button>
              <button onClick={exportToExcel} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#059669,#047857)', boxShadow: '0 2px 8px rgba(5,150,105,0.3)' }}>
                📊 Export
              </button>
              <button onClick={() => { setShowNewTicket(true); setNewTicket({ project_name: '', address: '', customer_phone: '', sales_name: '', sales_division: '', sn_unit: '', product: '', issue_case: '', description: '', assign_name: '', date: getJakartaDateString(), photo: null }); }}
                className="flex items-center gap-1.5 text-white text-sm font-bold px-4 py-2 rounded-xl"
                style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)', boxShadow: '0 4px 14px rgba(220,38,38,0.4)' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                New Ticket
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 max-w-[1600px] mx-auto w-full px-5 py-5 space-y-4">

          {/* Stat Cards — style berbeda dari PTS (horizontal bar style) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Ticket', value: stats.total, sub: 'Semua ticket Services', g: 'linear-gradient(135deg,#4f46e5,#6d28d9)', sh: 'rgba(79,70,229,0.3)', status: 'All' },
              { label: 'Waiting Approval', value: stats.waiting, sub: 'Perlu persetujuan', g: STATUS_GRADIENTS['Waiting Approval'].gradient, sh: STATUS_GRADIENTS['Waiting Approval'].shadow, status: 'Waiting Approval' },
              { label: 'In Repair 🔧', value: tickets.filter(t => t.services_status === 'In Repair').length, sub: 'Sedang diperbaiki', g: STATUS_GRADIENTS['In Repair'].gradient, sh: STATUS_GRADIENTS['In Repair'].shadow, status: 'In Repair' },
              { label: 'Solved ✅', value: stats.solved, sub: 'Selesai', g: STATUS_GRADIENTS['Solved'].gradient, sh: STATUS_GRADIENTS['Solved'].shadow, status: 'Solved' },
            ].map((c, i) => (
              <div key={i} onClick={() => setFilterStatus(f => f === c.status ? 'All' : c.status)}
                className="rounded-2xl p-4 flex flex-col gap-2 cursor-pointer hover:scale-[1.03] transition-all select-none relative overflow-hidden"
                style={{ background: c.g, boxShadow: filterStatus === c.status ? `0 6px 24px ${c.sh}` : `0 3px 12px ${c.sh}`, outline: filterStatus === c.status ? '3px solid white' : 'none' }}>
                {filterStatus === c.status && <span className="absolute top-1 left-2 text-white/80 text-[9px] font-bold uppercase tracking-widest">Filter Aktif ✓</span>}
                <span className="text-3xl font-black text-white leading-none mt-3">{c.value}</span>
                <p className="text-sm font-bold text-white leading-tight">{c.label}</p>
                <p className="text-[10px] text-white/70">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Mini Charts — style berbeda (horizontal bar style untuk Services) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Status distribution as horizontal bars */}
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)' }}>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">📊 Status Services</p>
              <div className="space-y-2.5">
                {stats.statusData.map((d, i) => (
                  <div key={d.name} className="cursor-pointer" onClick={() => setFilterStatus(f => f === d.name ? 'All' : d.name)}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-700 truncate flex-1">{d.name}</span>
                      <span className="text-xs font-black ml-2 flex-shrink-0" style={{ color: d.color }}>{d.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${stats.total > 0 ? (d.value / stats.total) * 100 : 0}%`, background: d.color }} />
                    </div>
                  </div>
                ))}
                {stats.statusData.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Belum ada data</p>}
              </div>
            </div>
            {/* Handler donut */}
            <MiniDonut data={stats.handlerData} total={stats.handlerData.reduce((s, d) => s + d.value, 0)} title="👥 Team Services Handler"
              onSliceClick={name => { setHandlerFilter(f => f === name ? null : name); setFilterStatus('All'); }}
              activeSlice={handlerFilter} />
          </div>

          {/* Ticket List */}
          <div ref={ticketListRef} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(200,200,200,0.6)', backdropFilter: 'blur(12px)' }}>
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between px-6 py-4 border-b" style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ticket List</span>
                <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-full">{ticketsLoading ? '...' : filteredTickets.length}</span>
              </div>
              {selectMode && canAdmin && selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-red-700">{selectedIds.size} dipilih</span>
                  <button onClick={() => setBulkConfirm(true)} className="text-xs font-bold text-white px-4 py-1.5 rounded-lg flex items-center gap-1" style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>🗑️ Hapus {selectedIds.size}</button>
                </div>
              )}
            </div>

            {/* Search/Filter */}
            <div className="px-6 py-3 border-b border-slate-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                  <input value={searchProject} onChange={e => setSearchProject(e.target.value)} placeholder="Cari project / issue..." className="w-full rounded-xl pl-8 pr-4 py-2 text-sm outline-none bg-slate-50 border border-slate-200 focus:bg-white focus:border-red-300" />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">👤</span>
                  <input value={searchSales} onChange={e => setSearchSales(e.target.value)} placeholder="Cari sales..." className="w-full rounded-xl pl-8 pr-4 py-2 text-sm outline-none bg-slate-50 border border-slate-200 focus:bg-white focus:border-red-300" />
                </div>
                <div className="relative">
                  <select value={handlerFilter ?? ''} onChange={e => setHandlerFilter(e.target.value || null)} className="w-full rounded-xl px-3 py-2 text-sm outline-none bg-slate-50 border border-slate-200 focus:bg-white focus:border-red-300 appearance-none cursor-pointer">
                    <option value="">All Handlers</option>
                    {teamMembers.map(m => <option key={m.id} value={m.full_name}>{m.full_name}</option>)}
                  </select>
                </div>
                <div className="relative">
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm outline-none bg-slate-50 border border-slate-200 focus:bg-white focus:border-red-300 appearance-none cursor-pointer">
                    <option value="All">Semua Status</option>
                    {SERVICES_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="relative">
                  <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm outline-none bg-slate-50 border border-slate-200 focus:bg-white focus:border-red-300 appearance-none cursor-pointer">
                    <option value="all">Semua Tahun</option>
                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Table — same style as PTS */}
            {ticketsLoading ? (
              <div className="space-y-3 py-2 p-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse flex gap-3 items-center bg-white/60 rounded-xl p-4 border border-slate-200">
                    <div className="flex-1 space-y-2"><div className="h-4 bg-slate-200 rounded w-2/5" /><div className="h-3 bg-slate-100 rounded w-1/4" /></div>
                    <div className="h-4 bg-slate-200 rounded w-1/6" /><div className="h-6 bg-slate-200 rounded-full w-20" />
                  </div>
                ))}
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center py-12"><div className="text-6xl mb-4">🔧</div><p className="text-slate-500 font-medium">Tidak ada ticket ditemukan</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse" style={{ background: 'transparent' }}>
                  <colgroup>
                    <col style={{ width: '3%' }} />   {/* No */}
                    <col style={{ width: '20%' }} />  {/* Project */}
                    <col style={{ width: '14%' }} />  {/* Product */}
                    <col style={{ width: '9%' }} />   {/* SN */}
                    <col style={{ width: '16%' }} />  {/* Issue */}
                    <col style={{ width: '10%' }} />  {/* Assigned */}
                    <col style={{ width: '10%' }} />  {/* Status PTS */}
                    <col style={{ width: '10%' }} />  {/* Status SVC */}
                    <col style={{ width: '8%' }} />   {/* Sales */}
                    <col style={{ width: '9%' }} />   {/* Actions */}
                  </colgroup>
                  <thead>
                    <tr className="border-b-2 border-slate-100" style={{ background: 'rgba(248,248,248,0.97)' }}>
                      <th className="px-2 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide border-r border-slate-100">
                        {selectMode && canAdmin
                          ? <input type="checkbox" checked={selectedIds.size === filteredTickets.length && filteredTickets.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded accent-red-600 cursor-pointer" />
                          : 'No'}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide border-r border-slate-100">Project / Lokasi</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide border-r border-slate-100">Product</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide border-r border-slate-100">SN Unit</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide border-r border-slate-100">Issue</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide border-r border-slate-100">Handler</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide border-r border-slate-100">Status PTS</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide border-r border-slate-100">Status SVC</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide border-r border-slate-100">Sales</th>
                      <th className="px-2 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map((t, idx) => (
                      <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors bg-white/40">
                        <td className="px-2 py-3 border-r border-slate-100 align-middle text-center" onClick={e => e.stopPropagation()}>
                          {selectMode && canAdmin
                            ? <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelectId(t.id)} className="w-4 h-4 rounded accent-red-600 cursor-pointer" />
                            : <span className="text-[11px] font-bold text-slate-400">{idx + 1}</span>}
                        </td>
                        <td className="px-3 py-3 border-r border-slate-100 align-middle">
                          <div className="font-bold text-slate-800 text-sm break-words leading-tight">{t.project_name}</div>
                          {t.address && <div className="text-[10px] text-slate-500 mt-0.5 truncate">📍 {t.address.split(',')[0]}</div>}
                          <div className="text-[10px] text-slate-400 mt-1">{formatDateTime(t.created_at)}</div>
                        </td>
                        <td className="px-3 py-3 border-r border-slate-100 align-middle">
                          {t.product && <span className="text-[12px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded break-words leading-tight inline-block">📦 {t.product}</span>}
                        </td>
                        <td className="px-3 py-3 border-r border-slate-100 align-middle"><div className="text-[13px] text-slate-600 break-words leading-tight">{t.sn_unit || '—'}</div></td>
                        <td className="px-3 py-3 border-r border-slate-100 align-middle"><div className="text-[13px] text-slate-700 break-words leading-tight">{t.issue_case}</div></td>
                        <td className="px-3 py-3 border-r border-slate-100 align-middle"><div className="text-sm text-slate-700 break-words leading-tight">{t.assign_name}</div></td>
                        <td className="px-3 py-3 border-r border-slate-100 align-middle">
                          <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${STATUS_COLORS[t.status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>{t.status}</span>
                        </td>
                        <td className="px-3 py-3 border-r border-slate-100 align-middle">
                          {t.services_status ? (
                            <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${STATUS_COLORS[t.services_status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>{t.services_status}</span>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-2 py-3 border-r border-slate-100 align-middle"><div className="text-xs text-slate-600 break-words leading-tight">{t.sales_name || '—'}</div></td>
                        <td className="px-1 py-2 align-middle">
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            <button onClick={() => openTicket(t)} className="text-red-600 hover:text-red-800 transition-colors" title="View Detail"><span className="text-sm">👁</span></button>
                            <button onClick={() => exportToPDF(t, [])} className="text-green-600 hover:text-green-800 transition-colors" title="Print PDF"><span className="text-sm">🖨️</span></button>
                            {t.services_status === 'Waiting Approval' && (
                              <button onClick={() => { setApprovalTicket(t); setShowApprovalModal(true); }} className="text-orange-600 hover:text-orange-800 transition-colors animate-pulse" title="Approve"><span className="text-sm">✅</span></button>
                            )}
                            {canAdmin && (
                              <button onClick={() => { setDeleteTarget(t); setDeleteConfirmText(''); setShowDeleteModal(true); }} className="text-red-500 hover:text-red-700 transition-colors" title="Hapus"><span className="text-sm">🗑️</span></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200" style={{ background: 'rgba(255,255,255,0.97)' }}>
                  <span className="text-xs text-slate-400">{filteredTickets.length} ticket ditemukan</span>
                  <span className="text-xs text-slate-400">{filteredTickets.length} of {tickets.filter(t => t.services_status || t.current_team === 'Team Services').length}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scale-in { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
        input:focus, select:focus, textarea:focus { outline: none; }
      `}</style>
    </div>
  );
}
