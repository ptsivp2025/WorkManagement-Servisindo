'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
// PTS DB — untuk fetch guest/sales
const supabasePTS = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_PTS_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PTS_ANON_KEY!
);

// ─── Fonnte WA via Supabase Edge Function (same pattern as ticketing) ────────
// ── Fonnte token di-cache dari Supabase app_settings ─────────────────────────
let _fonnteToken: string | null = null;
async function getFonnteToken(): Promise<string | null> {
  if (_fonnteToken) return _fonnteToken;
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'fonnte_token')
      .single();
    if (data?.value) {
      // value di JSONB bisa berupa string dengan kutip: '"token"' → strip kutip
      const raw = data.value;
      _fonnteToken = typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : String(raw);
      return _fonnteToken;
    }
  } catch { /* fallback ke env */ }
  const envToken = process.env.NEXT_PUBLIC_FONNTE_TOKEN;
  if (envToken) { _fonnteToken = envToken; return _fonnteToken; }
  return null;
}

// ── WA via direct fetch ke Edge Function (custom auth, tanpa Supabase session) ─
async function sendFonnteWA(
  target: string,
  message: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _meta?: Record<string, unknown>
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(`${supabaseUrl}/functions/v1/swift-responder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ type: 'reminder_wa', target, message }),
    });
    const data = await res.json();
    console.log('[sendFonnteWA] response:', data);
    return { ok: data?.ok === true, reason: data?.reason };
  } catch (err: any) {
    console.error('[sendFonnteWA] error:', err.message);
    return { ok: false, reason: err.message };
  }
}
// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = 'low' | 'medium' | 'high' | 'urgent';
type Status = 'pending' | 'done' | 'cancelled';
type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly';

interface Reminder {
  id: string;
  title?: string;
  project_name: string;
  description: string;
  assigned_to: string;
  assign_name: string;
  due_date: string;
  due_time: string;
  priority: Priority;
  status: Status;
  repeat: RepeatType;
  category: string;
  sales_name: string;
  sales_division: string;
  address: string;
  pic_name: string;
  pic_phone: string;
  created_by: string;
  created_at: string;
  notes?: string;
  wa_sent_h1?: boolean;
  completion_photo_url?: string;
  product?: string;
  updated_at?: string;
}

interface TeamUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
  team_type?: string;
  sales_division?: string;
  phone_number?: string;
  allowed_menus?: string[];
}

interface GuestUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
  phone_number?: string;
  sales_division?: string;
}

// Tidak ada form review di platform Services
const REVIEW_TRIGGER_CATEGORIES: string[] = [];

// ─── Constants ────────────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string; border: string; dot: string }> = {
  low:    { label: 'Low',    color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.4)', dot: '#94a3b8' },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.4)',  dot: '#f59e0b' },
  high:   { label: 'High',   color: '#f97316', bg: 'rgba(249,115,22,0.15)',  border: 'rgba(249,115,22,0.4)',  dot: '#f97316' },
  urgent: { label: 'Urgent', color: '#f43f5e', bg: 'rgba(244,63,94,0.2)',    border: 'rgba(244,63,94,0.5)',   dot: '#f43f5e' },
};

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string; border: string; icon: string }> = {
  pending:     { label: 'Pending',    color: '#92400e', bg: '#fef3c7', border: '#f59e0b', icon: '⏳' },
  done:        { label: 'Completed',  color: '#065f46', bg: '#d1fae5', border: '#10b981', icon: '✅' },
  cancelled:   { label: 'Cancelled', color: '#374151', bg: '#f3f4f6', border: '#6b7280', icon: '❌' },
};

const CATEGORIES = ['Meeting & Survey', 'Konfigurasi', 'Training', 'Internal', 'Perbaikan Unit Onsite', 'Analisa Onsite'];

const CATEGORY_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string; accent: string }> = {
  'Meeting & Survey':      { icon: '🤝', color: '#38bdf8', bg: 'rgba(56,189,248,0.15)',   border: 'rgba(56,189,248,0.4)',   accent: '#0ea5e9' },
  'Konfigurasi':           { icon: '⚙️', color: '#34d399', bg: 'rgba(52,211,153,0.15)',   border: 'rgba(52,211,153,0.4)',   accent: '#10b981' },
  'Training':              { icon: '🎓', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)',   border: 'rgba(251,191,36,0.4)',   accent: '#d97706' },
  'Internal':              { icon: '🕵🏻', color: '#34d399', bg: 'rgba(52,211,153,0.15)',  border: 'rgba(52,211,153,0.4)',   accent: '#19d628ff' },
  'Perbaikan Unit Onsite': { icon: '🔧', color: '#f97316', bg: 'rgba(249,115,22,0.15)',   border: 'rgba(249,115,22,0.4)',   accent: '#ea580c' },
  'Analisa Onsite':        { icon: '🔍', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)',   border: 'rgba(139,92,246,0.4)',   accent: '#7c3aed' },
};

const REPEAT_OPTIONS: { value: RepeatType; label: string }[] = [
  { value: 'none',    label: 'Tidak Berulang' },
  { value: 'daily',   label: 'Setiap Hari' },
  { value: 'weekly',  label: 'Setiap Minggu' },
  { value: 'monthly', label: 'Setiap Bulan' },
];

const SALES_DIVISIONS = [
  'IVP', 'MLDS', 'HAVS', 'Enterprise', 'DEC', 'ICS', 'POJ', 'VOJ', 'LOCOS',
  'VISIONMEDIA', 'UMP', 'BISOL', 'KIMS', 'IDC', 'IOCMEDAN', 'IOCPekanbaru',
  'IOCBandung', 'IOCJATENG', 'MVISEMARANG', 'POSSurabaya', 'IOCSurabaya',
  'IOCBali', 'SGP', 'OSS'
] as const;

const PIE_COLORS = ['#7c3aed','#0ea5e9','#10b981','#e11d48','#f59e0b','#6366f1','#14b8a6','#f97316','#8b5cf6','#06b6d4','#ec4899','#84cc16'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDatetime(createdAt: string) {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function isDueToday(due_date: string) {
  return due_date === new Date().toISOString().split('T')[0];
}

// isH1Before: dipindah ke daily-reminder edge function

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriorityBadge({ priority, onHeader }: { priority: Priority; onHeader?: boolean }) {
  const c = PRIORITY_CONFIG[priority];
  if (onHeader) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold"
        style={{ color: '#fff', background: c.dot, border: '2px solid rgba(255,255,255,0.6)', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
        {c.label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

function StatusBadge({ status, onHeader }: { status: Status; onHeader?: boolean }) {
  const c = STATUS_CONFIG[status];
  const solidBg: Record<Status, string> = {
    pending: '#d97706',
    done: '#059669',
    cancelled: '#4b5563',
  };
  if (onHeader) {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold"
        style={{ color: '#fff', background: solidBg[status], border: '2px solid rgba(255,255,255,0.6)', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>
        {c.icon} {c.label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>
      {c.label}
    </span>
  );
}

function CategoryBadge({ category, onHeader }: { category: string; onHeader?: boolean }) {
  const c = CATEGORY_CONFIG[category] ?? { icon: '📁', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.3)', accent: '#64748b' };
  if (onHeader) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold"
        style={{ color: '#fff', background: c.accent, border: '2px solid rgba(255,255,255,0.6)', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>
        {c.icon} {category}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>
      {c.icon} {category}
    </span>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold mb-1.5 tracking-widest uppercase" style={{ color: '#94a3b8' }}>{label}</label>
      {children}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
      <span className="text-lg">{icon}</span>
      <span className="text-sm font-bold tracking-wide text-slate-700">{title}</span>
    </div>
  );
}

function SectionHeaderSmall({ icon, title }: { icon: string; title: string }) {
  return (
    <p className="text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5" style={{ color: '#94a3b8' }}>
      <span>{icon}</span>{title}
    </p>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <span className="text-base flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: '#64748b' }}>{label}</p>
        <p className="text-sm font-semibold text-slate-800 break-words">{value}</p>
      </div>
    </div>
  );
}

// ─── Pie Chart Component ─────────────────────────────────────────────────────

function MiniPieChart({
  data, title, icon, activeFilter,
  onSliceClick,
}: {
  data: { label: string; value: number; color: string }[];
  title: string; icon: string;
  activeFilter?: string | null;
  onSliceClick?: (label: string) => void;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return (
    <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.07)', backdropFilter: 'blur(10px)' }}>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{icon} {title}</p>
      <p className="text-slate-400 text-xs text-center py-4">Belum ada data</p>
    </div>
  );

  const sorted = [...data].sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.07)', backdropFilter: 'blur(10px)' }}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{icon} {title}</p>
        <span className="text-[10px] font-black text-slate-400">{total} total</span>
      </div>
      <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {sorted.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          const isActive = activeFilter === d.label;
          return (
            <div key={d.label}
              className="cursor-pointer group"
              onClick={() => onSliceClick && onSliceClick(d.label)}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-semibold truncate flex-1 pr-2"
                  style={{ color: isActive ? d.color : '#475569' }}>
                  {d.label}
                </span>
                <span className="text-[10px] font-black flex-shrink-0" style={{ color: d.color }}>{d.value}</span>
              </div>
              <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
                <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    background: d.color,
                    opacity: isActive ? 1 : 0.65,
                    boxShadow: isActive ? `0 0 6px ${d.color}80` : 'none',
                  }} />
              </div>
              {isActive && (
                <div className="text-[9px] font-bold mt-0.5" style={{ color: d.color }}>✓ Filter aktif</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────

function MiniCalendar({ reminders, calendarMonth, setCalendarMonth, selectedCalDay, setSelectedCalDay }: {
  reminders: Reminder[];
  calendarMonth: Date;
  setCalendarMonth: (d: Date) => void;
  selectedCalDay: string | null;
  setSelectedCalDay: (s: string | null) => void;
}) {
  const y = calendarMonth.getFullYear(), m = calendarMonth.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const shortDay = ['M','S','R','K','J','S','M'];

  const getCount = (day: number) => {
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return reminders.filter(r => r.due_date === ds).length;
  };

  const totalThisMonth = reminders.filter(r => r.due_date.startsWith(`${y}-${String(m+1).padStart(2,'0')}`)).length;

  return (
    <div className="rounded-2xl flex-shrink-0 overflow-hidden" style={{ width: 360, background: 'linear-gradient(160deg,#1e293b 0%,#0f172a 100%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 32px rgba(0,0,0,0.28)' }}>
      {/* Month nav */}
      <div className="px-5 py-4 flex items-center justify-between">
        <button onClick={() => setCalendarMonth(new Date(y, m-1, 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all font-bold text-lg">‹</button>
        <div className="text-center">
          <p className="text-white font-black text-base tracking-wide">{monthNames[m]}</p>
          <p className="text-slate-400 text-xs font-semibold mt-0.5">{y} · <span className="text-amber-400">{totalThisMonth} jadwal</span></p>
        </div>
        <button onClick={() => setCalendarMonth(new Date(y, m+1, 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all font-bold text-lg">›</button>
      </div>

      {/* Day headers */}
      <div className="px-4 pb-1">
        <div className="grid grid-cols-7">
          {shortDay.map((d,i) => (
            <div key={i} className={`text-center text-[10px] font-bold py-1.5 ${i >= 5 ? 'text-amber-400/70' : 'text-slate-500'}`}>{d}</div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-y-1 pb-3">
          {Array.from({ length: (firstDay === 0 ? 6 : firstDay - 1) }).map((_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
            const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const cnt = getCount(day);
            const isSel = selectedCalDay === ds;
            const isToday = ds === today;
            const isWeekend = (new Date(ds).getDay() === 0 || new Date(ds).getDay() === 6);
            return (
              <button key={day} onClick={() => setSelectedCalDay(isSel ? null : ds)}
                className="relative flex flex-col items-center justify-center rounded-xl transition-all hover:scale-110 py-1.5"
                style={{
                  background: isSel
                    ? 'linear-gradient(135deg,#dc2626,#991b1b)'
                    : isToday
                    ? 'rgba(220,38,38,0.18)'
                    : cnt > 0
                    ? 'rgba(99,102,241,0.15)'
                    : 'transparent',
                  boxShadow: isSel ? '0 2px 10px rgba(220,38,38,0.5)' : isToday ? '0 0 0 1.5px rgba(220,38,38,0.5)' : cnt > 0 ? '0 0 0 1px rgba(99,102,241,0.3)' : 'none',
                }}>
                <span className="text-xs font-bold leading-none"
                  style={{ color: isSel ? 'white' : isToday ? '#f87171' : cnt > 0 ? '#a5b4fc' : isWeekend ? '#64748b' : '#94a3b8' }}>
                  {day}
                </span>
                {cnt > 0 && (
                  <span className="mt-0.5 text-[8px] font-black rounded-full px-1 leading-none"
                    style={{ background: isSel ? 'rgba(255,255,255,0.3)' : '#6366f1', color: 'white' }}>
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day events */}
      {selectedCalDay && (() => {
        const dayRems = reminders.filter(r => r.due_date === selectedCalDay);
        return dayRems.length > 0 ? (
          <div className="border-t p-3 space-y-2" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.25)' }}>
            <p className="text-[10px] font-bold tracking-widest uppercase px-1" style={{ color: '#94a3b8' }}>
              📅 {formatDate(selectedCalDay)} — {dayRems.length} jadwal
            </p>
            {dayRems.map(r => (
              <div key={r.id} className="rounded-xl p-3"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{(r.project_name || '').trim() || ((r as any).title || '').trim() || '—'}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>⏰ {r.due_time} · 👤 {r.assign_name}</p>
                  </div>
                  <CategoryBadge category={r.category} />
                </div>
              </div>
            ))}
          </div>
        ) : null;
      })()}
    </div>
  );
}

// ─── Loading screen ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999]"
      style={{ backgroundImage: `url('/IVP_Background.png')`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="flex flex-col items-center gap-3 px-10 py-8 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.92)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <svg className="w-12 h-12 animate-spin" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="25" cy="25" r="20" stroke="#f1f1f1" strokeWidth="5" />
          <path d="M25 5 A20 20 0 0 1 45 25" stroke="#dc2626" strokeWidth="5" strokeLinecap="round" />
        </svg>
        <p className="text-gray-700 font-semibold text-sm tracking-wide">Loading...</p>
      </div>
    </div>
  );
}

// ─── Reschedule Modal ─────────────────────────────────────────────────────────

function RescheduleModal({
  reminder,
  onClose,
  onSave,
}: {
  reminder: Reminder;
  onClose: () => void;
  onSave: (newDate: string, newTime: string, reason: string) => void;
}) {
  const [newDate, setNewDate] = useState(reminder.due_date);
  const [newTime, setNewTime] = useState(reminder.due_time);
  const [reason, setReason] = useState('');
  const inputStyle = { background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.15)' };
  const inputCls = "w-full rounded-xl px-4 py-3 text-sm outline-none transition-all text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-red-500/40";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000] p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ animation: 'scale-in 0.25s ease-out', border: '2px solid rgba(245,158,11,0.5)' }}>
        {/* Header */}
        <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg,#d97706,#b45309)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">📅 Re-Schedule Jadwal</h3>
              <p className="text-amber-200/80 text-xs mt-0.5 truncate max-w-[260px]">{reminder.project_name || (reminder as any).title || '—'}</p>
            </div>
            <button onClick={onClose} className="bg-white/15 hover:bg-white/25 text-white p-2 rounded-lg">✕</button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {/* Current date info */}
          <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <span className="text-xl">📌</span>
            <div>
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Jadwal Sekarang</p>
              <p className="text-sm font-bold text-gray-800">{formatDate(reminder.due_date)} · {reminder.due_time}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1.5 tracking-widest uppercase" style={{ color: '#94a3b8' }}>Tanggal Baru *</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5 tracking-widest uppercase" style={{ color: '#94a3b8' }}>Waktu Baru</label>
              <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1.5 tracking-widest uppercase" style={{ color: '#94a3b8' }}>Alasan Re-Schedule</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              className={`${inputCls} resize-none`} style={inputStyle}
              placeholder="Contoh: Permintaan klien untuk mengundur jadwal..." />
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all"
              style={{ background: 'rgba(255,255,255,0.95)', color: '#64748b', border: '1px solid rgba(0,0,0,0.12)' }}>
              Batal
            </button>
            <button onClick={() => { if (newDate) onSave(newDate, newTime, reason); }}
              disabled={!newDate}
              className="flex-1 text-white py-3 rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2 hover:scale-[1.02] disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#d97706,#b45309)', boxShadow: '0 4px 14px rgba(217,119,6,0.35)' }}>
              📅 Simpan Re-Schedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReminderSchedulePage() {
  const router = useRouter();
  const [appReady, setAppReady]             = useState(false);
  const [dashLoading, setDashLoading]       = useState(false);
  const [isLoggedIn, setIsLoggedIn]         = useState(false);
  const [loginForm, setLoginForm]           = useState({ username: '', password: '' });
  const [loginTime, setLoginTime]           = useState<number | null>(null);
  const [showNotificationPopup, setShowNotificationPopup] = useState(false);
  const [showBellPopup, setShowBellPopup]   = useState(false);
  const [myReminders, setMyReminders]       = useState<Reminder[]>([]);
  const [currentUser, setCurrentUser]       = useState<TeamUser | null>(null);
  const [teamUsers, setTeamUsers]           = useState<TeamUser[]>([]);
  const [guestUsers, setGuestUsers]         = useState<GuestUser[]>([]);
  const [reminders, setReminders]           = useState<Reminder[]>([]);
  const [listLoading, setListLoading]       = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Reminder | null>(null);

  const [view, setView]                     = useState<'list' | 'form'>('list');
  const [showFormModal, setShowFormModal]   = useState(false);
  const [detailReminder, setDetailReminder] = useState<Reminder | null>(null);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  // Filters — extended with team handler & category
  const [filterStatus, setFilterStatus]     = useState<Status | 'all'>('all');
  const [filterYear, setFilterYear]         = useState<string>('all');
  const [searchProject, setSearchProject]   = useState('');
  const [searchSales, setSearchSales]       = useState('');
  const [searchDivisionSales, setSearchDivisionSales]       = useState('');
  const [searchTeamHandler, setSearchTeamHandler] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchProduct, setSearchProduct] = useState('');
  const [productFilter, setProductFilter] = useState<string | null>(null);

  const [calendarMonth, setCalendarMonth]   = useState(new Date());
  const [toast, setToast]                   = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [selectedCalDay, setSelectedCalDay] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  // Kalender-only selection — tidak mempengaruhi filter list/chart/summary
  const [calOnlyDay, setCalOnlyDay]         = useState<string | null>(null);
  const [exportLoading, setExportLoading]   = useState(false);
  const [sendingWA, setSendingWA]           = useState<string | null>(null);

  // ─── Guest search state ───────────────────────────────────────────────────
  const [guestSearch, setGuestSearch]         = useState('');
  const [guestDropdownOpen, setGuestDropdownOpen] = useState(false);
  const guestDropdownRef = useRef<HTMLDivElement>(null);

  // ─── Delete Modal State ───────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget]       = useState<Reminder | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // ─── Update Status with photo ──────────────────────────────────────────────
  const [pendingStatus, setPendingStatus]   = useState<Status | null>(null);
  const [statusPhoto, setStatusPhoto]       = useState<File | null>(null);
  const [statusPhotoPreview, setStatusPhotoPreview] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const statusPhotoRef = useRef<HTMLInputElement>(null);

  // ─── Resend Form Review ────────────────────────────────────────────────────
  const [resendingFormReview, setResendingFormReview] = useState(false);

  const notify = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const emptyForm: Omit<Reminder, 'id' | 'created_at' | 'created_by' | 'wa_sent_h1'> = {
    project_name: '', description: '', assigned_to: '', assign_name: '',
    due_date: new Date().toISOString().split('T')[0],
    due_time: '09:00', priority: 'medium', status: 'pending',
    repeat: 'none', category: 'Meeting & Survey',
    sales_name: '', sales_division: '', address: '', pic_name: '', pic_phone: '',
    notes: '', product: '',
  };
  const [formData, setFormData] = useState(emptyForm);
  const fd = (patch: Partial<typeof emptyForm>) => setFormData(prev => ({ ...prev, ...patch }));

  // ─── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Sama persis dengan ticketing: baca localStorage → set user → fetch data
    const saved = localStorage.getItem('svc_currentUser');
    const user = saved ? (JSON.parse(saved) as TeamUser) : null;

    if (user) {
      setCurrentUser(user);
      setIsLoggedIn(true);
      setLoginTime(Date.now());
    }

    // Fetch parallel — tidak tunggu satu selesai dulu
    // fetchTeamUsers dipanggil setelah user di-set agar session siap
    Promise.all([
      fetchTeamUsers(),
      fetchGuestUsers(),
      fetchRemindersQuiet(user),
    ]).then(() => {
      setAppReady(true); // ← tampilkan konten setelah data siap
      // Popup notif setelah data loaded
      if (user && (user.role === 'team' || user.role === 'admin')) {
        supabase
          .from('reminders')
          .select('*')
          .eq('assigned_to', user.username)
          .neq('status', 'done')
          .neq('status', 'cancelled')
          .order('due_date', { ascending: true })
          .then(({ data: activeData }: { data: any[] | null }) => {
            const active = (activeData ?? []) as Reminder[];
            if (active.length > 0) {
              setMyReminders(active);
              setTimeout(() => setShowNotificationPopup(true), 800);
            }
          });
      }
    });

    // Realtime — subscribe setelah user di-set
    const ch = supabase.channel('reminders-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, () => {
        const s = localStorage.getItem('svc_currentUser');
        const u = s ? (JSON.parse(s) as TeamUser) : user;
        fetchRemindersQuiet(u);
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  // ─── Session timeout check ───────────────────────────────────────────────
  useEffect(() => {
    const checkSession = () => {
      const savedTime = localStorage.getItem('svc_loginTime');
      if (!savedTime) return;
      const sixHours = 6 * 60 * 60 * 1000;
      if (Date.now() - parseInt(savedTime) > sixHours) {
        localStorage.removeItem('svc_currentUser');
        localStorage.removeItem('svc_loginTime');
        const target = window.top !== window ? window.top : window;
        if (target) target.location.href = '/';
      }
    };
    checkSession(); // cek langsung saat mount
    const interval = setInterval(checkSession, 60000); // cek tiap menit
    return () => clearInterval(interval);
  }, []);

  // ─── H-1 WA auto-send ────────────────────────────────────────────────────
  // Ditangani oleh Supabase Edge Function: daily-reminder (pg_cron)
  // Berjalan otomatis setiap hari tanpa perlu buka halaman

  const fetchTeamUsers = async () => {
    // Select hanya kolom yang pasti ada di Services DB
    // (allowed_menus dan team_type mungkin tidak ada di schema Services)
    const { data, error } = await supabase
      .from('users')
      .select('id, username, full_name, role, phone_number')
      .order('full_name');

    if (error) {
      console.warn('[fetchTeamUsers] Error:', error.message);
      return;
    }
    if (data) {
      // Hanya tampilkan role 'team' sebagai pilihan handler (bukan admin)
      const filtered = (data as any[]).filter(u => u.role === 'team');
      setTeamUsers((filtered.length > 0 ? filtered : data) as TeamUser[]);
    }
  };

  const fetchGuestUsers = async () => {
    // Gabungkan guest dari Services DB + PTS DB
    const [{ data: svcData }, { data: ptsData }] = await Promise.all([
      supabase.from('users').select('id, username, full_name, role, phone_number, sales_division').eq('role', 'guest').order('full_name'),
      supabasePTS.from('users').select('id, username, full_name, role, phone_number, sales_division').eq('role', 'guest').order('full_name'),
    ]);
    const combined: GuestUser[] = [...((svcData ?? []) as GuestUser[])];
    const svcNames = new Set((svcData ?? []).map((u: any) => u.username));
    for (const g of (ptsData ?? []) as GuestUser[]) {
      if (!svcNames.has(g.username)) combined.push(g);
    }
    combined.sort((a, b) => a.full_name.localeCompare(b.full_name));
    setGuestUsers(combined);
  };

  // 🔥 PERUBAHAN UTAMA: Urutkan berdasarkan created_at terbaru di paling atas
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Hapus ${selectedIds.size} jadwal yang dipilih?`)) return;
    setBulkDeleting(true);
    const { error } = await supabase.from('service_reminders').delete().in('id', Array.from(selectedIds));
    if (!error) { setReminders(p => p.filter(r => !selectedIds.has(r.id))); setSelectedIds(new Set()); }
    else alert('Gagal: ' + error.message);
    setBulkDeleting(false);
  };

  const toggleSelectId = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const toggleSelectAll = () => setSelectedIds(prev =>
    prev.size === filteredReminders.length ? new Set() : new Set(filteredReminders.map(r => r.id))
  );

  const fetchRemindersQuiet = async (user?: TeamUser | null) => {
    // Tentukan user: dari param → state → localStorage
    let activeUser: TeamUser | null = user ?? currentUser;
    if (!activeUser) {
      const saved = localStorage.getItem('svc_currentUser');
      if (saved) { try { activeUser = JSON.parse(saved) as TeamUser; } catch { /* ignore */ } }
    }
    let query = supabase.from('reminders').select('*')
      .order('created_at', { ascending: false });
    // Team PTS bisa lihat SEMUA schedule (tidak difilter per user)
    // Filter hanya untuk popup notif, bukan untuk list utama
    const { data, error } = await query;
    if (!error && data) setReminders(data as Reminder[]);
  };

  // 🔥 PERUBAHAN UTAMA: Urutkan berdasarkan created_at terbaru di paling atas
  const fetchReminders = async () => {
    setListLoading(true);
    // Fallback ke localStorage kalau currentUser state belum ready
    let activeUser: TeamUser | null = currentUser;
    if (!activeUser) {
      const saved = localStorage.getItem('svc_currentUser');
      if (saved) { try { activeUser = JSON.parse(saved) as TeamUser; } catch { /* ignore */ } }
    }
    let query = supabase.from('reminders').select('*')
      .order('created_at', { ascending: false });
    // Team PTS bisa lihat SEMUA schedule
    const { data, error } = await query;
    if (!error && data) setReminders(data as Reminder[]);
    setTimeout(() => setListLoading(false), 400);
  };

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formData.project_name.trim())            { notify('error', 'Nama project wajib diisi!');  return; }
    if (!formData.assigned_to)             { notify('error', 'Pilih anggota team!');           return; }
    if (!formData.due_date)                { notify('error', 'Tanggal wajib diisi!');          return; }
    if (!formData.address.trim()) { notify('error', 'Lokasi Project wajib diisi!');  return; }

    const isTriggerCat = false; // Tidak ada form review di Services
    if (!formData.sales_name?.trim()) {
      notify('error', 'Pilih Sales wajib diisi!');
      return;
    }
    if (isTriggerCat && !formData.sales_name?.trim()) {
      notify('error', `Kategori "${formData.category}" memerlukan pilihan Guest / Sales untuk form review!`);
      return;
    }

    const assignee = teamUsers.find(u => u.username === formData.assigned_to);
    const payload = { ...formData, assign_name: assignee?.full_name ?? formData.assigned_to, created_by: currentUser?.username ?? 'system' };

    setSaving(true);
    const { error } = editingReminder
      ? await supabase.from('reminders').update(payload).eq('id', editingReminder.id)
      : await supabase.from('reminders').insert([payload]);

    if (error) {
      notify('error', 'Gagal menyimpan: ' + error.message);
      setSaving(false);
      return;
    }

    notify('success', editingReminder ? 'Reminder diperbarui!' : 'Reminder ditambahkan!');

    // ── Kirim WA notifikasi ke assignee saat reminder BARU dibuat ────────────
    if (!editingReminder && assignee?.phone_number) {
      const assigneeName = assignee.full_name ?? formData.assigned_to;
      const createdBy = currentUser?.username ?? 'system';
      const msg =
        `🗓️ *JADWAL BARU — PTS IVP*\n\n` +
        `Halo *${assigneeName}*, kamu mendapat jadwal baru:\n\n` +
        `*Nama Project: ${formData.project_name}*\n` +
        `*Deskripsi: ${formData.description}*\n` +
        `📦 *Product: ${formData.product}*\n` +
        `🏷️ Kategori: ${formData.category}\n` +
        `📍 Lokasi: ${formData.address || '-'}\n` +
        `👤 Sales: ${formData.sales_name}${formData.sales_division ? ' - ' + formData.sales_division : ''}\n` +
        `🕐 Jadwal: *${formatDate(formData.due_date)}${formData.due_time ? ' · ' + formData.due_time : ''}*\n` +
        (formData.pic_name  ? `🙋 PIC: ${formData.pic_name}${formData.pic_phone ? ' - ' + formData.pic_phone : ''}\n\n`    : '') +
        (formData.notes     ? `📝 Catatan: ${formData.notes}\n\n`    : '') +
        `-\n` +
       `Link Dashboard: https://team-ticketing.vercel.app/dashboard\n` +
        `jangan lupa peralatan & Semangat💪🏼`;

      const waResult = await sendFonnteWA(assignee.phone_number, msg, { reminderType: 'new_schedule' });
      if (!waResult.ok) console.warn('[WA new schedule] Gagal kirim:', waResult.reason);
      else notify('success', `WA notifikasi terkirim ke ${assigneeName}!`);
    } else if (!editingReminder && !assignee?.phone_number) {
      console.warn('[WA new schedule] Nomor WA assignee tidak tersedia:', formData.assigned_to);
    }
    // ─────────────────────────────────────────────────────────────────────────

    setSaving(false);
    setShowFormModal(false);
    setView('list');
    setEditingReminder(null);
    setFormData(emptyForm);
    fetchRemindersQuiet();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('reminders').delete().eq('id', deleteTarget.id);
    if (error) { notify('error', 'Gagal menghapus.'); return; }
    notify('success', 'Reminder dihapus.');
    setDetailReminder(null);
    setShowDeleteModal(false);
    setDeleteTarget(null);
    setDeleteConfirmText('');
    fetchRemindersQuiet();
  };


  const printReminder = (r: Reminder) => {
    const pd = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const addrRow = r.address ? '<div class="gf" style="grid-column:span 2"><div class="gl">Alamat</div><div class="gv">' + r.address + '</div></div>' : '';
    const descRow = r.description ? '<div class="gf" style="grid-column:span 2"><div class="gl">Deskripsi</div><div class="gv">' + r.description + '</div></div>' : '';
    const sdiv = r.sales_division ? ' · ' + r.sales_division : '';
    const rows = [
      '<div class="gf"><div class="gl">Project</div><div class="gv">' + r.project_name + '</div></div>',
      '<div class="gf"><div class="gl">Kategori</div><div class="gv">' + r.category + '</div></div>',
      '<div class="gf"><div class="gl">Handler</div><div class="gv">' + (r.assign_name || r.assigned_to) + '</div></div>',
      '<div class="gf"><div class="gl">Status</div><div class="gv">' + r.status + '</div></div>',
      '<div class="gf"><div class="gl">Tanggal</div><div class="gv">' + r.due_date + ' ' + (r.due_time || '') + '</div></div>',
      '<div class="gf"><div class="gl">Sales</div><div class="gv">' + (r.sales_name || '-') + sdiv + '</div></div>',
      addrRow, descRow,
    ].join('');
    const html = [
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reminder</title>',
      '<style>body{font-family:Arial,sans-serif;padding:28px;color:#1e293b;max-width:700px;margin:0 auto}',
      'h1{font-size:18px;font-weight:800;color:#dc2626;margin-bottom:4px}',
      '.g{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}',
      '.gf{border:1px solid #e2e8f0;border-radius:8px;padding:9px 12px}',
      '.gl{font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;margin-bottom:2px}',
      '.gv{font-size:12px;font-weight:600;color:#1e293b}',
      '.ft{margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}',
      '</style></head><body>',
      '<h1>Reminder Schedule — Servisindo</h1>',
      '<p style="font-size:11px;color:#64748b">Dicetak: ' + pd + '</p>',
      '<div class="g">' + rows + '</div>',
      '<div class="ft"><div>Servisindo Work Management</div><div>' + pd + '</div></div>',
      '</body></html>',
    ].join('');
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
  };

  const openDeleteModal = (r: Reminder) => {
    setDeleteTarget(r);
    setDeleteConfirmText('');
    setShowDeleteModal(true);
  };

  const handleStatusChange = async (id: string, status: Status, photoUrl?: string) => {
    const updatePayload: Record<string, unknown> = { status };
    if (photoUrl) updatePayload['completion_photo_url'] = photoUrl;
    const { error } = await supabase.from('reminders').update(updatePayload).eq('id', id);
    if (error) { notify('error', 'Gagal update status.'); return; }
    notify('success', 'Status diperbarui!');
    // ── WA ke handler saat status Done ───────────────────────────────────
    if (status === 'done') {
      try {
        const reminder = reminders.find(r => r.id === id);
        if (reminder) {
          const { data: handlerUser } = await supabase
            .from('users').select('phone_number, full_name')
            .eq('username', reminder.assigned_to)
            .eq('team_type', 'Team PTS').single();
          if (handlerUser?.phone_number) {
            const msg =
              `✅ *JADWAL SELESAI — PTS IVP*\n\n` +
              `Terima kasih *${handlerUser.full_name}*!\n` +
              `Jadwal *${reminder.project_name}* sudah *Selesai*.\n` +
              `📦 *Product: ${reminder.product ?? '-'}*\n` +
              `🏷️ ${reminder.category} · ${formatDate(reminder.due_date)}\n` +
              `\nTetap semangat! 💪`;
            await sendFonnteWA(handlerUser.phone_number, msg);
          }

          // Form review tidak digunakan di platform Services
        }
      } catch (waEx) { console.warn('[status done] WA failed:', waEx); }
    }
    // ─────────────────────────────────────────────────────────────────────
    fetchRemindersQuiet();
    if (detailReminder?.id === id) setDetailReminder(prev => prev ? { ...prev, status } : null);
  };

  const handleConfirmStatusUpdate = async () => {
    if (!detailReminder || !pendingStatus) return;
    if (pendingStatus === 'done' && !statusPhoto) {
      notify('error', 'Foto wajib diupload untuk status Completed!');
      return;
    }
    setUpdatingStatus(true);
    let photoUrl: string | undefined;
    if (statusPhoto) {
      const ext = statusPhoto.name.split('.').pop();
      const fileName = `completion_${detailReminder.id}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('reminder-photos')
        .upload(fileName, statusPhoto, { upsert: true });
      if (upErr) {
        notify('error', 'Gagal upload foto: ' + upErr.message);
        setUpdatingStatus(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('reminder-photos').getPublicUrl(fileName);
      photoUrl = urlData?.publicUrl;
    }
    await handleStatusChange(detailReminder.id, pendingStatus, photoUrl);
    setPendingStatus(null);
    setStatusPhoto(null);
    setStatusPhotoPreview(null);
    setUpdatingStatus(false);
  };

  // Form review tidak tersedia di platform Services
  const handleResendFormReview = async (_r: Reminder) => {
    notify('success', 'Form review tidak tersedia di platform Work Management Services.');
  };

  const openEdit = (r: Reminder) => {
    setEditingReminder(r);
    setFormData({ project_name: r.project_name || (r as any).title || '', description: r.description, assigned_to: r.assigned_to, assign_name: r.assign_name ?? '', due_date: r.due_date,
      due_time: r.due_time, priority: r.priority, status: r.status, repeat: r.repeat, category: r.category,
      sales_name: r.sales_name ?? '', sales_division: r.sales_division ?? '', address: r.address ?? '',
      pic_name: r.pic_name ?? '', pic_phone: r.pic_phone ?? '', notes: r.notes ?? '', product: r.product ?? '' });
    setDetailReminder(null);
    setShowFormModal(true);
  };

  // ─── Re-Schedule ───────────────────────────────────────────────────────────

  const handleReschedule = async (newDate: string, newTime: string, reason: string) => {
    if (!rescheduleTarget) return;
    const noteAdd = reason ? `\n[Re-Schedule ${formatDate(newDate)}: ${reason}]` : '';
    const { error } = await supabase.from('reminders').update({
      due_date: newDate,
      due_time: newTime,
      notes: (rescheduleTarget.notes ?? '') + noteAdd,
    }).eq('id', rescheduleTarget.id);
    if (error) {
      console.error('[Reschedule error]', error);
      notify('error', `Gagal re-schedule: ${error.message}`);
      return;
    }
    notify('success', `Jadwal berhasil dipindah ke ${formatDate(newDate)}!`);
    // ── WA ke handler tentang reschedule ──────────────────────────────────
    try {
      const { data: handlerUser } = await supabase
        .from('users').select('phone_number, full_name')
        .eq('username', rescheduleTarget.assigned_to)
        .eq('team_type', 'Team PTS').single();
      if (handlerUser?.phone_number) {
        const msg =
          `📅 *JADWAL DIUBAH — PTS IVP*\n\n` +
          `Halo *${handlerUser.full_name}*, jadwal kamu telah di-reschedule:\n\n` +
          `*Project: ${rescheduleTarget.project_name}*\n` +
          `*Kategori: ${rescheduleTarget.category}*\n` +
          `📦 *Product: ${rescheduleTarget.product ?? '-'}*\n` +
          `📌 Jadwal Lama: ${formatDate(rescheduleTarget.due_date)} ${rescheduleTarget.due_time}\n` +
          `📅 Jadwal Baru: *${formatDate(newDate)} ${newTime}*\n` +
          (rescheduleTarget.pic_name ? `🙋 PIC: ${rescheduleTarget.pic_name}\n` : '') +
          (rescheduleTarget.pic_phone ? `📱 No. PIC: ${rescheduleTarget.pic_phone}\n` : '') +
          (rescheduleTarget.notes ? `📝 Catatan: ${rescheduleTarget.notes}\n` : '') +
          (reason ? `📝 Alasan: ${reason}\n` : '') +
          `\n🔗 https://team-ticketing.vercel.app/dashboard`;
        await sendFonnteWA(handlerUser.phone_number, msg);
      }
    } catch (waEx) { console.warn('[reschedule] WA failed:', waEx); }
    // ─────────────────────────────────────────────────────────────────────
    setRescheduleTarget(null);
    setDetailReminder(null);
    fetchRemindersQuiet();
  };

  // ─── Manual WA send ────────────────────────────────────────────────────────

  const handleSendWA = async (r: Reminder) => {
    if (!r.assigned_to) { notify('error', 'Reminder belum di-assign ke handler.'); return; }
    setSendingWA(r.id);

    // Ambil phone_number handler dari tabel users
    const { data: handlerData, error: handlerErr } = await supabase
      .from('users')
      .select('phone_number, full_name')
      .eq('username', r.assigned_to)
      .eq('team_type', 'Team PTS')
      .single();

    if (handlerErr || !handlerData?.phone_number) {
      setSendingWA(null);
      notify('error', `Nomor WA handler (${r.assign_name || r.assigned_to}) tidak tersedia di database.`);
      return;
    }

    const msg =
      `📋 *REMINDER JADWAL PTS IVP*\n\n` +
      `Halo *${handlerData.full_name}*, ada jadwal yang perlu kamu kerjakan:\n\n` +
      `*Nama Project: ${r.project_name}*\n` +
      `*Deskripsi: ${r.description}*\n` +
      `*Kategori: ${r.category}*\n` +
      `📦 *Product: ${r.product ?? '-'}*\n` +
      `📍 Lokasi: ${r.address || '-'}\n` +
      `👤 Sales: ${r.sales_name || '-'}\n` +
      `    Divisi Sales: ${r.sales_division || '-'}\n` +
      `🕐 Jadwal: *${formatDate(r.due_date)} · ${r.due_time}*\n` +
      (r.pic_name ? `🙋 PIC: ${r.pic_name}\n` : '') +
      (r.pic_phone ? `📱 No. PIC: ${r.pic_phone}\n` : '') +
      (r.notes ? `📝 Catatan: ${r.notes}\n` : '') +
      `\n_Pesan dari Reminder Schedule PTS IVP_`;

    const result = await sendFonnteWA(handlerData.phone_number, msg, { reminderType: 'manual', reminderId: r.id });
    setSendingWA(null);
    if (result.ok) notify('success', `WA berhasil dikirim ke ${handlerData.full_name}!`);
    else notify('error', `Gagal kirim WA: ${result.reason ?? 'Unknown error'}`);
  };

  // ─── Export Excel ──────────────────────────────────────────────────────────

  const handleExportExcel = async () => {
    setExportLoading(true);
    try {
      const headers = ['No','Project Name','Product','Kategori','Sales','Divisi Sales','Address','Assign To','Status','Prioritas','Tanggal','Waktu','PIC','No. PIC','Created By','Created At','Catatan','Link Foto Bukti'];
      const rows = filteredReminders.map((r, i) => [
        i + 1, r.project_name || (r as any).title || '', r.product ?? '', r.category, r.sales_name, r.sales_division, r.address, r.assign_name,
        STATUS_CONFIG[r.status].label, PRIORITY_CONFIG[r.priority].label,
        r.due_date, r.due_time, r.pic_name, r.pic_phone, r.created_by,
        r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID') : '', r.notes ?? '', r.completion_photo_url ?? '',
      ]);
      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Reminder_Schedule_PTS_IVP_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify('success', 'Export berhasil!');
    } catch { notify('error', 'Gagal export.'); }
    setExportLoading(false);
  };

  // ─── Filters ───────────────────────────────────────────────────────────────

  const availableYears = Array.from(new Set(reminders.map(r => r.due_date.substring(0, 4)))).sort((a, b) => b.localeCompare(a));

  const filteredReminders = reminders.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterYear !== 'all' && !r.due_date.startsWith(filterYear)) return false;
    if (filterCategory !== 'all' && r.category !== filterCategory) return false;
    const rName = ((r.project_name || '').trim() || ((r as any).title || '').trim()).toLowerCase();
    if (searchProject && !rName.includes(searchProject.toLowerCase()) &&
        !r.address?.toLowerCase().includes(searchProject.toLowerCase())) return false;
    if (searchSales && !r.sales_name?.toLowerCase().includes(searchSales.toLowerCase())) return false;
    if (searchDivisionSales && !r.sales_division?.toLowerCase().includes(searchDivisionSales.toLowerCase())) return false;
    if (searchTeamHandler && !r.assign_name?.toLowerCase().includes(searchTeamHandler.toLowerCase()) &&
        !r.assigned_to?.toLowerCase().includes(searchTeamHandler.toLowerCase())) return false;
    if (productFilter && r.product !== productFilter) return false;
    if (searchProduct && !r.product?.toLowerCase().includes(searchProduct.toLowerCase())) return false;
    if (selectedCalDay && r.due_date !== selectedCalDay) return false;
    return true;
  }).sort((a, b) => {
    // Sort by created_at desc (yang paling baru dibuat di atas)
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

  const todayCount      = reminders.filter(r => isDueToday(r.due_date) && r.status !== 'done' && r.status !== 'cancelled').length;
  const pendingCount    = reminders.filter(r => r.status === 'pending').length;
  const doneCount       = reminders.filter(r => r.status === 'done').length;
  const totalCount      = reminders.length;

  // ─── Pie chart data ────────────────────────────────────────────────────────

  const sourceReminders = filterYear === 'all' ? reminders : reminders.filter(r => r.due_date.startsWith(filterYear));

  const projectPieData = (() => {
    const map: Record<string, number> = {};
    sourceReminders.forEach(r => { const k = r.category; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([label, value], i) => ({ label, value, color: PIE_COLORS[i % PIE_COLORS.length] }));
  })();

  const salesPieData = (() => {
    const map: Record<string, number> = {};
    sourceReminders.forEach(r => { if (r.sales_division) { map[r.sales_division] = (map[r.sales_division] || 0) + 1; } });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([label, value], i) => ({ label, value, color: PIE_COLORS[i % PIE_COLORS.length] }));
  })();

  const teamPtsPieData = (() => {
    const map: Record<string, number> = {};
    sourceReminders.forEach(r => { if (r.assign_name) { map[r.assign_name] = (map[r.assign_name] || 0) + 1; } });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([label, value], i) => ({ label, value, color: PIE_COLORS[i % PIE_COLORS.length] }));
  })();

  const productPieData = (() => {
    const map: Record<string, number> = {};
    sourceReminders.forEach(r => { if (r.product) { map[r.product] = (map[r.product] || 0) + 1; } });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([label, value], i) => ({ label, value, color: PIE_COLORS[i % PIE_COLORS.length] }));
  })();

  const isAdmin = currentUser?.role === 'admin';
  const canAddReminder = currentUser?.role === 'admin' || currentUser?.role === 'team';

  const myActiveReminders = reminders.filter(r =>
    currentUser && r.assigned_to === currentUser.username && r.status !== 'done' && r.status !== 'cancelled'
  );

  // ─── Style helpers ─────────────────────────────────────────────────────────
  const inputCls = "w-full rounded-xl px-4 py-3 text-sm outline-none transition-all text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-red-500/40";
  const inputStyle = { background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.12)' };

  // ─── Login handler ─────────────────────────────────────────────────────────
  const handleLogout = () => {
    setSelectMode(false); setSelectedIds(new Set()); setFilterStatus('all'); setFilterYear('all'); setFilterCategory('all');
    setSearchProject(''); setSearchSales(''); setSearchDivisionSales('');
    setSearchTeamHandler(''); setSearchProduct(''); setProductFilter(null);
    setSelectedCalDay(null); setGuestSearch('');
    localStorage.removeItem('svc_currentUser'); localStorage.removeItem('svc_loginTime');
    setCurrentUser(null); setIsLoggedIn(false); setLoginTime(null);
    // Redirect ke halaman login dashboard (parent window jika di dalam iframe)
    const target = window.top !== window ? window.top : window;
    if (target) target.location.href = '/';
  };

  const handleLogin = async () => {
    try {
      const { data, error } = await supabase.from('users').select('*')
        .eq('username', loginForm.username).eq('password', loginForm.password).single();
      if (error || !data) { notify('error', 'Username atau password salah!'); return; }
      const now = Date.now();
      setDashLoading(true);
      setCurrentUser(data);
      setIsLoggedIn(true);
      setLoginTime(now);
      localStorage.setItem('svc_currentUser', JSON.stringify(data));
      localStorage.setItem('svc_loginTime', now.toString());
      await fetchRemindersQuiet(data); // re-fetch dengan filter role yang baru login

      const active = reminders.filter(r => r.assigned_to === data.username && r.status !== 'done' && r.status !== 'cancelled');
      setMyReminders(active);
      if (active.length > 0) setTimeout(() => setShowNotificationPopup(true), 600);
      setTimeout(() => setDashLoading(false), 2200);
    } catch { notify('error', 'Terjadi kesalahan.'); }
  };

  // ─── Not ready — tampilkan loading screen saat pertama kali fetch data ────
  if (!appReady) return <LoadingScreen />;

  // ─── Login page ────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center relative"
        style={{ backgroundImage: `url('/IVP_Background.png')`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} />
        {toast && (
          <div className={`fixed top-5 right-5 z-[200] px-5 py-3.5 rounded-xl shadow-2xl text-sm font-bold flex items-center gap-2 text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
            {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
          </div>
        )}
        <div className="relative z-10 bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-8 w-full max-w-md" style={{ border: '2px solid rgba(220,38,38,0.3)' }}>
          <div className="flex justify-center mb-5"><img src="/logo-servisindo.png" alt="Servisindo" style={{ height: '52px', width: 'auto', objectFit: 'contain' }} /></div>
          <h1 className="text-3xl font-black text-center mb-1 text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-red-800">Login</h1>
          <p className="text-center text-gray-600 font-semibold mb-6 text-sm">Reminder Schedule<br/><span className="text-red-600 font-bold">PTS IVP — Team Work Planner</span></p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold mb-2 text-gray-700">Username</label>
              <input type="text" value={loginForm.username}
                onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 focus:border-red-600 focus:ring-4 focus:ring-red-200 transition-all font-medium bg-white"
                placeholder="Masukkan username"
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-2 text-gray-700">Password</label>
              <input type="password" value={loginForm.password}
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 focus:border-red-600 focus:ring-4 focus:ring-red-200 transition-all font-medium bg-white"
                placeholder="Masukkan password"
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>
            <button onClick={handleLogin}
              className="w-full bg-gradient-to-r from-red-600 to-red-800 text-white py-3 rounded-xl hover:from-red-700 hover:to-red-900 font-bold shadow-xl transition-all">
              🔐 Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative" style={{
      backgroundImage: `url('/IVP_Background.png')`,
      backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
    }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(255,255,255,0.08)' }} />
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-5 right-5 z-[200] px-5 py-3.5 rounded-xl shadow-2xl text-sm font-bold flex items-center gap-2 text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}
            style={{ boxShadow: toast.type === 'success' ? '0 4px 20px rgba(16,185,129,0.4)' : '0 4px 20px rgba(220,38,38,0.4)' }}>
            {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
          </div>
        )}

        {/* ── RESCHEDULE MODAL ── */}
        {rescheduleTarget && (
          <RescheduleModal
            reminder={rescheduleTarget}
            onClose={() => setRescheduleTarget(null)}
            onSave={handleReschedule}
          />
        )}

        {/* ── DELETE MODAL ── */}
        {showDeleteModal && deleteTarget && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10001] p-4">
            <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full p-6"
              style={{ animation: 'scale-in 0.25s ease-out', border: '2px solid rgba(220,38,38,0.5)' }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🗑️</span>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Hapus Reminder</h3>
                  <p className="text-xs font-medium text-gray-500">{deleteTarget.project_name}</p>
                  <p className="text-xs text-gray-400">{deleteTarget.category}</p>
                </div>
              </div>
              <div className="rounded-xl p-3 mb-4 text-xs"
                style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', color: '#b91c1c' }}>
                ⚠️ <strong>Tindakan ini tidak dapat dibatalkan.</strong> Reminder ini akan dihapus permanen dari database.
              </div>
              <div className="mb-4">
                <label className="block text-sm font-bold mb-1 text-gray-700">
                  Ketik <span className="font-mono bg-red-100 text-red-700 px-1.5 py-0.5 rounded">HAPUS</span> untuk konfirmasi
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder="Ketik HAPUS di sini..."
                  className="w-full rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                  style={{ border: '2px solid rgba(220,38,38,0.3)', background: 'white' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleDelete}
                  disabled={deleteConfirmText !== 'HAPUS'}
                  className="bg-gradient-to-r from-red-600 to-red-800 text-white py-2.5 rounded-xl font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:from-red-700 hover:to-red-900">
                  🗑️ Hapus Permanen
                </button>
                <button
                  onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); setDeleteConfirmText(''); }}
                  className="bg-gray-100 text-gray-700 py-2.5 rounded-xl font-bold hover:bg-gray-200 transition-all">
                  ✕ Batal
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── FORM MODAL (Tambah / Edit Reminder) ── */}
        {/* Bulk Delete Confirm Modal */}
      {bulkConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border-2 border-red-400">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 flex items-center gap-3">
              <span className="text-2xl">🗑️</span>
              <div><h3 className="font-bold text-white">Hapus {selectedIds.size} Jadwal?</h3>
              <p className="text-red-100 text-xs mt-0.5">Tindakan ini tidak dapat dibatalkan</p></div>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-5">Kamu akan menghapus <strong>{selectedIds.size} jadwal</strong> yang dipilih secara permanen dari sistem.</p>
              <div className="flex gap-3">
                <button onClick={() => setBulkConfirm(false)} className="flex-1 border-2 border-gray-300 text-gray-700 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all text-sm">Batal</button>
                <button onClick={async () => {
                  setBulkConfirm(false); setBulkDeleting(true);
                  const { error } = await supabase.from('service_reminders').delete().in('id', Array.from(selectedIds));
                  if (!error) { setReminders(p => p.filter(r => !selectedIds.has(r.id))); setSelectedIds(new Set()); setSelectMode(false); }
                  else alert('Gagal: ' + error.message);
                  setBulkDeleting(false);
                }} className="flex-[2] bg-gradient-to-r from-red-600 to-red-700 text-white py-2.5 rounded-xl font-bold shadow-lg transition-all text-sm hover:from-red-700 hover:to-red-800">
                  🗑️ Ya, Hapus Permanen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFormModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000] p-4 overflow-y-auto"
            onClick={e => { if (e.target === e.currentTarget) { setShowFormModal(false); setEditingReminder(null); setFormData(emptyForm); } }}>
            <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-2xl my-4"
              style={{ animation: 'scale-in 0.25s ease-out', border: '1.5px solid rgba(220,38,38,0.25)' }}>
              {/* Header */}
              <div className="px-8 py-6 rounded-t-2xl" style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">{editingReminder ? '✏️ Edit Reminder' : '➕ Tambah Reminder'}</h2>
                    <p className="text-red-200/80 text-xs mt-1">Isi detail jadwal & informasi project</p>
                  </div>
                  <button onClick={() => { setShowFormModal(false); setEditingReminder(null); setFormData(emptyForm); }}
                    className="bg-white/15 hover:bg-white/25 text-white p-2 rounded-lg transition-all">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              <div className="p-8 space-y-5 max-h-[75vh] overflow-y-auto">
                <SectionHeader icon="📋" title="Informasi Jadwal" />

                <FormField label="Nama Project*">
                  <input value={formData.project_name} onChange={e => fd({ project_name: e.target.value })}
                    className={inputCls} style={inputStyle} placeholder="Contoh: PT. Maju Bersama" />
                </FormField>

                <FormField label="Lokasi Project *">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2">📍</span>
                    <input value={formData.address} onChange={e => fd({ address: e.target.value })}
                      className={`${inputCls} pl-9`} style={inputStyle} placeholder="Contoh: Gedung Wisma 46 Lt. 12" />
                  </div>
                </FormField>

                <FormField label="Deskripsi">
                  <textarea value={formData.description} onChange={e => fd({ description: e.target.value })}
                    rows={2} className={`${inputCls} resize-none`} style={inputStyle} placeholder="Detail pekerjaan..." />
                </FormField>

                {/* Category picker */}
                <div>
                  <label className="block text-xs font-bold mb-2 tracking-widest uppercase" style={{ color: '#94a3b8' }}>Kategori *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {CATEGORIES.map(cat => {
                      const c = CATEGORY_CONFIG[cat];
                      const sel = formData.category === cat;
                      return (
                        <button key={cat} type="button" onClick={() => fd({ category: cat })}
                          className="flex items-center gap-3 px-4 py-4 rounded-xl border-2 text-left transition-all"
                          style={sel
                            ? { borderColor: c.accent, background: c.bg, color: c.color }
                            : { borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.5)', color: '#64748b' }}>
                          <span className="text-2xl">{c.icon}</span>
                          <span className="text-base font-bold leading-tight flex-1">{cat}</span>
                          {sel && <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Assign To *">
                    <select value={formData.assigned_to} onChange={e => fd({ assigned_to: e.target.value })}
                      className={inputCls} style={inputStyle}>
                      <option value="">-- Pilih Team Services --</option>
                      {teamUsers.map(u => <option key={u.id} value={u.username}>{u.full_name}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Pengulangan">
                    <select value={formData.repeat} onChange={e => fd({ repeat: e.target.value as RepeatType })}
                      className={inputCls} style={inputStyle}>
                      {REPEAT_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </FormField>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField label="Tanggal *">
                    <input type="date" value={formData.due_date} onChange={e => fd({ due_date: e.target.value })}
                      className={inputCls} style={inputStyle} />
                  </FormField>
                  <FormField label="Waktu">
                    <input type="time" value={formData.due_time} onChange={e => fd({ due_time: e.target.value })}
                      className={inputCls} style={inputStyle} />
                  </FormField>
                  <FormField label="Prioritas">
                    <select value={formData.priority} onChange={e => fd({ priority: e.target.value as Priority })}
                      className={inputCls} style={inputStyle}>
                      {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </FormField>
                </div>

                {editingReminder && (
                  <FormField label="Status">
                    <select value={formData.status} onChange={e => fd({ status: e.target.value as Status })}
                      className={inputCls} style={inputStyle}>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </FormField>
                )}

                <SectionHeader icon="🏢" title="Informasi Project" />

                <FormField label="Product / Unit (Opsional)">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2">📦</span>
                    <input value={formData.product ?? ''} onChange={e => fd({ product: e.target.value })}
                      className={`${inputCls} pl-9`} style={inputStyle} placeholder="Contoh: Sony VPL-FHZ85, Crestron DMPS3..." />
                  </div>
                </FormField>

                {/* ── Pilih Sales — selalu tampil untuk semua kategori ── */}
                {(() => {
                  const isTrigger = false; // tidak ada form review
                  return (
                    <div className="rounded-xl p-4 space-y-3"
                      style={isTrigger
                        ? { background: 'rgba(124,58,237,0.06)', border: '1.5px solid rgba(124,58,237,0.25)' }
                        : { background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.1)' }}>

                      {/* Banner ⭐ hanya untuk trigger categories */}
                      {isTrigger && (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-base">⭐</span>
                            <p className="text-sm font-bold text-violet-700">Assign Guest untuk Form Review</p>
                          </div>
                          <p className="text-xs text-violet-600 -mt-1">
                            Kategori <strong>{formData.category}</strong> memerlukan review dari Guest / Sales. Pengingat Guest / Sales mengisi kepuasan pelanggan.
                          </p>
                        </>
                      )}

                      <FormField label="Pilih Sales *">
                        <div className="relative" ref={guestDropdownRef}>
                          {/* Search + display input */}
                          <div
                            className="w-full rounded-xl px-4 py-3 text-sm flex items-center justify-between cursor-pointer transition-all"
                            style={{
                              ...inputStyle,
                              borderColor: guestDropdownOpen
                                ? (isTrigger ? 'rgba(124,58,237,0.6)' : 'rgba(99,102,241,0.5)')
                                : (isTrigger ? 'rgba(124,58,237,0.35)' : 'rgba(0,0,0,0.15)'),
                              boxShadow: guestDropdownOpen ? '0 0 0 3px rgba(124,58,237,0.1)' : undefined,
                            }}
                            onClick={() => { setGuestDropdownOpen(o => !o); if (!guestDropdownOpen) setGuestSearch(''); }}
                          >
                            {formData.sales_name
                              ? <span className="font-semibold text-slate-800">{formData.sales_name} <span className={`font-normal ${isTrigger ? 'text-violet-500' : 'text-slate-500'}`}>{formData.sales_division ? `· ${formData.sales_division}` : ''}</span></span>
                              : <span className="text-slate-400">-- Pilih Sales --</span>
                            }
                            <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${guestDropdownOpen ? 'rotate-180' : ''} ${isTrigger ? 'text-violet-400' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </div>

                          {/* Dropdown panel */}
                          {guestDropdownOpen && (
                            <div className="absolute z-50 mt-1 w-full rounded-xl shadow-xl overflow-hidden"
                              style={{ background: 'white', border: '1.5px solid rgba(124,58,237,0.3)', maxHeight: '240px' }}>
                              {/* Search box */}
                              <div className="p-2 border-b" style={{ borderColor: 'rgba(124,58,237,0.15)' }}>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400 text-sm">🔍</span>
                                  <input
                                    autoFocus
                                    type="text"
                                    value={guestSearch}
                                    onChange={e => setGuestSearch(e.target.value)}
                                    placeholder="Cari nama sales / guest..."
                                    className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)', color: '#1e293b' }}
                                    onClick={e => e.stopPropagation()}
                                  />
                                </div>
                              </div>
                              {/* Options */}
                              <div className="overflow-y-auto" style={{ maxHeight: '180px' }}>
                                {/* Clear option */}
                                <div
                                  className="px-4 py-2.5 text-sm cursor-pointer hover:bg-violet-50 text-slate-400 italic"
                                  onClick={() => { fd({ sales_name: '', sales_division: '' }); setGuestDropdownOpen(false); setGuestSearch(''); }}
                                >
                                  -- Pilih Sales --
                                </div>
                                {guestUsers
                                  .filter(u =>
                                    !guestSearch.trim() ||
                                    u.full_name.toLowerCase().includes(guestSearch.toLowerCase()) ||
                                    u.username.toLowerCase().includes(guestSearch.toLowerCase()) ||
                                    (u.sales_division ?? '').toLowerCase().includes(guestSearch.toLowerCase())
                                  )
                                  .map(u => (
                                    <div
                                      key={u.id}
                                      className="px-4 py-2.5 cursor-pointer transition-colors flex items-center justify-between gap-2"
                                      style={{
                                        background: formData.sales_name === u.full_name ? 'rgba(124,58,237,0.1)' : undefined,
                                        borderLeft: formData.sales_name === u.full_name ? '3px solid #7c3aed' : '3px solid transparent',
                                      }}
                                      onMouseEnter={e => { if (formData.sales_name !== u.full_name) (e.currentTarget as HTMLDivElement).style.background = 'rgba(124,58,237,0.05)'; }}
                                      onMouseLeave={e => { if (formData.sales_name !== u.full_name) (e.currentTarget as HTMLDivElement).style.background = ''; }}
                                      onClick={() => {
                                        fd({ sales_name: u.full_name, sales_division: u.sales_division ?? '' });
                                        setGuestDropdownOpen(false);
                                        setGuestSearch('');
                                      }}
                                    >
                                      <div>
                                        <p className="text-sm font-semibold text-slate-800">{u.full_name}</p>
                                        <p className="text-xs text-violet-500">@{u.username}{u.sales_division ? ` · ${u.sales_division}` : ''}</p>
                                      </div>
                                      {formData.sales_name === u.full_name && <span className="text-violet-600 text-sm">✓</span>}
                                    </div>
                                  ))
                                }
                                {guestSearch.trim() && guestUsers.filter(u =>
                                  u.full_name.toLowerCase().includes(guestSearch.toLowerCase()) ||
                                  u.username.toLowerCase().includes(guestSearch.toLowerCase()) ||
                                  (u.sales_division ?? '').toLowerCase().includes(guestSearch.toLowerCase())
                                ).length === 0 && (
                                  <div className="px-4 py-4 text-center text-xs text-gray-400">Tidak ada sales ditemukan</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Close dropdown on outside click */}
                        {guestDropdownOpen && (
                          <div className="fixed inset-0 z-40" onClick={() => { setGuestDropdownOpen(false); setGuestSearch(''); }} />
                        )}
                      </FormField>

                      {/* Konfirmasi form review — hanya untuk trigger categories */}
                      {isTrigger && formData.sales_name && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
                          <span className="text-sm">✅</span>
                          <p className="text-xs font-semibold text-violet-700">
                            Form review akan otomatis muncul di akun <strong>{formData.sales_name}</strong> setelah status jadwal ini diubah ke <strong>Completed</strong>.
                            {formData.sales_division && <span className="ml-1 text-violet-500">· Divisi: <strong>{formData.sales_division}</strong></span>}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <SectionHeader icon="🎯" title="PIC Project (Opsional)" />

                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Nama PIC">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2">🙋</span>
                      <input value={formData.pic_name} onChange={e => fd({ pic_name: e.target.value })}
                        className={`${inputCls} pl-9`} style={inputStyle} placeholder="Nama PIC di lokasi" />
                    </div>
                  </FormField>
                  <FormField label="No. PIC">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2">📱</span>
                      <input type="tel" value={formData.pic_phone} onChange={e => fd({ pic_phone: e.target.value })}
                        className={`${inputCls} pl-9`} style={inputStyle} placeholder="08xxx" />
                    </div>
                  </FormField>
                </div>

                {formData.assigned_to && (
                  <div className="rounded-xl p-3 flex items-start gap-3" style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)' }}>
                    <span className="text-green-500 text-lg">💬</span>
                    <div>
                      <p className="text-sm font-bold text-green-700">WA Otomatis H-1</p>
                      <p className="text-xs text-green-600 mt-0.5">Pesan pengingat akan otomatis dikirim via WA ke <strong>{formData.assigned_to}</strong> sehari sebelum jadwal.</p>
                    </div>
                  </div>
                )}

                <SectionHeader icon="📝" title="Catatan Tambahan" />

                <FormField label="Catatan">
                  <textarea value={formData.notes} onChange={e => fd({ notes: e.target.value })}
                    rows={2} className={`${inputCls} resize-none`} style={inputStyle} placeholder="Informasi tambahan untuk team..." />
                </FormField>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => { setShowFormModal(false); setEditingReminder(null); setFormData(emptyForm); }}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all"
                    style={{ background: 'rgba(255,255,255,0.95)', color: '#64748b', border: '1px solid rgba(0,0,0,0.12)' }}>
                    Batal
                  </button>
                  <button onClick={handleSave} disabled={saving}
                    className="flex-1 text-white py-3 rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2 hover:scale-[1.02]"
                    style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)', boxShadow: '0 4px 14px rgba(220,38,38,0.35)' }}>
                    {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {editingReminder ? 'Simpan Perubahan' : '➕ Tambah Reminder'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── NOTIFICATION POPUP ── */}
        {showNotificationPopup && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden border-4 border-yellow-400"
              style={{ animation: 'scale-in 0.3s ease-out' }}>
              <div className="p-5 border-b-2 border-yellow-300" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl animate-bounce">🔔</span>
                    <div>
                      <h3 className="text-lg font-bold text-white">Reminder Kamu</h3>
                      <p className="text-sm text-white/90">{myReminders.length} reminder aktif yang diassign ke kamu</p>
                    </div>
                  </div>
                  <button onClick={() => setShowNotificationPopup(false)} className="text-white hover:bg-white/20 rounded-lg p-2 font-bold">✕</button>
                </div>
              </div>
              <div className="max-h-[calc(80vh-140px)] overflow-y-auto p-4 space-y-2">
                {myReminders.map(r => (
                  <div key={r.id} onClick={() => { setDetailReminder(r); setShowNotificationPopup(false); }}
                    className="rounded-xl p-3 border-2 cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all"
                    style={{ background: 'rgba(249,250,251,0.9)', borderColor: '#e5e7eb' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <CategoryBadge category={r.category} />
                          <PriorityBadge priority={r.priority} />
                        </div>
                        <p className="font-bold text-sm text-gray-800 truncate">{(r.project_name || '').trim() || ((r as any).title || '').trim() || '—'}</p>
                        {r.address && <p className="text-xs text-gray-500 mt-0.5">📍 {r.address}</p>}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <StatusBadge status={r.status} />
                        <p className="text-[10px] text-gray-500 mt-1">{formatDate(r.due_date)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t-2 border-gray-200 bg-gray-50">
                <button onClick={() => setShowNotificationPopup(false)}
                  className="w-full bg-gradient-to-r from-red-600 to-red-800 text-white py-3 rounded-xl font-bold transition-all">
                  ✕ Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── BELL POPUP ── */}
        {showBellPopup && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden border-4 border-yellow-400"
              style={{ animation: 'scale-in 0.3s ease-out' }}>
              <div className="p-5 border-b-2 border-yellow-300" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🔔</span>
                    <div>
                      <h3 className="text-lg font-bold text-white">Reminder Aktif Kamu</h3>
                      <p className="text-sm text-white/90">{myActiveReminders.length} aktif</p>
                    </div>
                  </div>
                  <button onClick={() => setShowBellPopup(false)} className="text-white hover:bg-white/20 rounded-lg p-2 font-bold">✕</button>
                </div>
              </div>
              <div className="max-h-[calc(80vh-140px)] overflow-y-auto p-4 space-y-2">
                {myActiveReminders.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <div className="text-5xl mb-3">✅</div>
                    <p className="font-semibold">Tidak ada reminder aktif</p>
                  </div>
                ) : myActiveReminders.map(r => (
                  <div key={r.id} onClick={() => { setDetailReminder(r); setShowBellPopup(false); }}
                    className="rounded-xl p-3 border-2 cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all"
                    style={{ background: 'rgba(249,250,251,0.9)', borderColor: '#e5e7eb' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <CategoryBadge category={r.category} />
                        </div>
                        <p className="font-bold text-sm text-gray-800 truncate">{(r.project_name || '').trim() || ((r as any).title || '').trim() || '—'}</p>
                        {r.address && <p className="text-xs text-gray-500 mt-0.5">📍 {r.address}</p>}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <StatusBadge status={r.status} />
                        <p className="text-[10px] text-gray-500 mt-1">{formatDate(r.due_date)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t-2 border-gray-200 bg-gray-50">
                <button onClick={() => setShowBellPopup(false)}
                  className="w-full bg-gradient-to-r from-red-600 to-red-800 text-white py-3 rounded-xl font-bold transition-all">
                  ✕ Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── DETAIL SIDEBAR (right panel, like image reference) ── */}
        {detailReminder && (
          <div className="fixed inset-0 z-[9999] flex"
            onClick={e => { if (e.target === e.currentTarget) { setDetailReminder(null); setPendingStatus(null); setStatusPhoto(null); setStatusPhotoPreview(null); } }}>
            {/* Backdrop */}
            <div className="flex-1 bg-black/40" onClick={() => { setDetailReminder(null); setPendingStatus(null); setStatusPhoto(null); setStatusPhotoPreview(null); }} />
            {/* Right panel */}
            <div className="w-[460px] max-w-full bg-white flex flex-col overflow-hidden shadow-2xl"
              style={{ borderLeft: '2px solid #dc2626', animation: 'slide-in-right 0.22s ease-out', maxHeight: '100vh' }}>

              {/* Panel top header — ID + close */}
              <div className="px-5 py-3 flex items-center justify-between flex-shrink-0 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: (() => { const c = CATEGORY_CONFIG[detailReminder.category]; return c ? c.accent : '#dc2626'; })() }}>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 leading-none">Detail Jadwal</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{formatDate(detailReminder.due_date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all" title="Buka di tab baru">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  </button>
                  <button onClick={() => { setDetailReminder(null); setPendingStatus(null); setStatusPhoto(null); setStatusPhotoPreview(null); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all" title="Tutup">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              </div>

              {/* Status badge row */}
              <div className="px-5 py-2.5 flex items-center gap-2 flex-shrink-0 border-b border-slate-100">
                <StatusBadge status={detailReminder.status} />
                <PriorityBadge priority={detailReminder.priority} />
                <CategoryBadge category={detailReminder.category} />
                {detailReminder.wa_sent_h1 && (
                  <span className="text-[10px] font-semibold text-emerald-600">✓ WA H-1</span>
                )}
              </div>

              {/* Project name */}
              <div className="px-5 py-3 border-b border-slate-100 flex-shrink-0">
                <h2 className="text-base font-black text-slate-800 leading-snug">{(detailReminder.project_name || '').trim() || ((detailReminder as any).title || '').trim() || '—'}</h2>
                {detailReminder.address && (
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    {detailReminder.address}
                  </p>
                )}
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto">

                {/* Informasi Assign */}
                <div className="border-b border-slate-100">
                  <button className="w-full px-5 py-3 flex items-center justify-between text-left">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                      <span className="text-sm font-semibold text-slate-700">Informasi Handler</span>
                    </div>
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7"/></svg>
                  </button>
                  <div className="px-5 pb-3 divide-y divide-slate-50">
                    <div className="flex items-center gap-3 py-2.5">
                      <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                      <div>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Assign To</p>
                        <p className="text-sm font-semibold text-slate-800">{detailReminder.assign_name}</p>
                        <p className="text-[11px] text-slate-400">@{detailReminder.assigned_to}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 py-2.5">
                      <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      <div>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Tanggal & Waktu</p>
                        <p className="text-sm font-semibold text-slate-800">{formatDate(detailReminder.due_date)}</p>
                        <p className="text-[11px] text-slate-400">{detailReminder.due_time}</p>
                      </div>
                    </div>
                    {detailReminder.repeat !== 'none' && (
                      <div className="flex items-center gap-3 py-2.5">
                        <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Pengulangan</p>
                          <p className="text-sm font-semibold text-slate-800">{REPEAT_OPTIONS.find(r => r.value === detailReminder.repeat)?.label}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Detail Project */}
                <div className="border-b border-slate-100">
                  <button className="w-full px-5 py-3 flex items-center justify-between text-left">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                      <span className="text-sm font-semibold text-slate-700">Detail Project</span>
                    </div>
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7"/></svg>
                  </button>
                  <div className="px-5 pb-3 divide-y divide-slate-50">
                    {detailReminder.product && (
                      <div className="flex items-start gap-3 py-2.5">
                        <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                        <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Product / Unit</p><p className="text-sm font-semibold text-slate-800">{detailReminder.product}</p></div>
                      </div>
                    )}
                    {(detailReminder.sales_name || detailReminder.sales_division) && (
                      <div className="flex items-start gap-3 py-2.5">
                        <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                        <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Sales & Divisi</p>
                          <p className="text-sm font-semibold text-slate-800">{detailReminder.sales_name}</p>
                          {detailReminder.sales_division && <p className="text-[11px] text-slate-400">{detailReminder.sales_division}</p>}
                        </div>
                      </div>
                    )}
                    {detailReminder.pic_name && (
                      <div className="flex items-start gap-3 py-2.5">
                        <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Nama PIC</p><p className="text-sm font-semibold text-slate-800">{detailReminder.pic_name}</p></div>
                      </div>
                    )}
                    {detailReminder.pic_phone && (
                      <div className="flex items-start gap-3 py-2.5">
                        <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                        <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Telepon PIC</p>
                          <a href={`tel:${detailReminder.pic_phone}`} className="text-sm font-semibold text-blue-600 hover:underline" onClick={e => e.stopPropagation()}>{detailReminder.pic_phone}</a>
                        </div>
                      </div>
                    )}
                    {detailReminder.description && (
                      <div className="flex items-start gap-3 py-2.5">
                        <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Deskripsi</p><p className="text-sm text-slate-700 leading-relaxed">{detailReminder.description}</p></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Catatan */}
                {detailReminder.notes && (
                  <div className="border-b border-slate-100">
                    <div className="px-5 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg>
                        <span className="text-sm font-semibold text-slate-700">Catatan</span>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line pl-6">{detailReminder.notes}</p>
                    </div>
                  </div>
                )}

                {/* Foto bukti selesai */}
                {detailReminder.status === 'done' && detailReminder.completion_photo_url && (
                  <div className="border-b border-slate-100">
                    <div className="px-5 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        <span className="text-sm font-semibold text-slate-700">Foto Bukti Selesai</span>
                      </div>
                      <img src={detailReminder.completion_photo_url} alt="Foto bukti" className="w-full rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity" style={{ maxHeight: 200 }} onClick={() => window.open(detailReminder.completion_photo_url, '_blank')} />
                      <a href={detailReminder.completion_photo_url} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-800 pl-0">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                        Buka di tab baru
                      </a>
                    </div>
                  </div>
                )}

                {/* Update Status */}
                <div className="border-b border-slate-100">
                  <div className="px-5 py-3">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                      <span className="text-sm font-semibold text-slate-700">Update Status</span>
                    </div>
                    {detailReminder.status === 'done' ? (
                      <div className="flex items-center gap-2 py-2 pl-6">
                        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <p className="text-sm text-emerald-700 font-semibold">Jadwal telah selesai</p>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 pl-6">
                        {(Object.keys(STATUS_CONFIG) as Status[]).map(s => {
                          const c = STATUS_CONFIG[s];
                          const isActive = (pendingStatus ?? detailReminder.status) === s;
                          return (
                            <button key={s}
                              onClick={() => { setPendingStatus(s); if (s !== 'done') { setStatusPhoto(null); setStatusPhotoPreview(null); } }}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border"
                              style={{
                                background: isActive ? c.bg : '#fff',
                                color: c.color,
                                borderColor: isActive ? c.border : '#e2e8f0',
                                fontWeight: isActive ? 700 : 500,
                              }}>
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Photo upload */}
                    {detailReminder.status !== 'done' && (pendingStatus ?? detailReminder.status) === 'done' && (
                      <div className="mt-3 pl-6">
                        <p className="text-[11px] font-semibold text-emerald-700 mb-2">Foto Bukti Selesai <span className="text-red-500">*</span></p>
                        <input ref={statusPhotoRef} type="file" accept="image/*" className="hidden"
                          onChange={e => { const file = e.target.files?.[0]; if (file) { setStatusPhoto(file); const reader = new FileReader(); reader.onload = ev => setStatusPhotoPreview(ev.target?.result as string); reader.readAsDataURL(file); } }} />
                        {statusPhotoPreview ? (
                          <div className="relative">
                            <img src={statusPhotoPreview} alt="preview" className="w-full max-h-36 object-cover rounded-xl" />
                            <button onClick={() => { setStatusPhoto(null); setStatusPhotoPreview(null); if (statusPhotoRef.current) statusPhotoRef.current.value = ''; }}
                              className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => statusPhotoRef.current?.click()}
                            className="w-full border-2 border-dashed rounded-xl py-5 flex flex-col items-center gap-1.5 transition-all hover:bg-emerald-50"
                            style={{ borderColor: 'rgba(16,185,129,0.4)' }}>
                            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                            <span className="text-xs font-semibold text-emerald-600">Klik untuk upload foto</span>
                          </button>
                        )}
                      </div>
                    )}

                    {pendingStatus && pendingStatus !== detailReminder.status && (
                      <div className="flex gap-2 mt-3 pl-6">
                        <button onClick={() => { setPendingStatus(null); setStatusPhoto(null); setStatusPhotoPreview(null); }}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Batal</button>
                        <button onClick={handleConfirmStatusUpdate}
                          disabled={updatingStatus || (pendingStatus === 'done' && !statusPhoto)}
                          className="flex-1 py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg,#059669,#047857)' }}>
                          {updatingStatus ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>}
                          {updatingStatus ? 'Menyimpan...' : 'Konfirmasi'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                {(isAdmin || currentUser?.role === 'team') && (
                  <div className="px-5 py-3 flex flex-wrap gap-2">
                    {detailReminder.status !== 'done' && (
                      <button onClick={() => setRescheduleTarget(detailReminder)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg,#d97706,#b45309)' }}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        Re-Schedule
                      </button>
                    )}
                    {isAdmin && (
                      <button onClick={() => handleSendWA(detailReminder)} disabled={sendingWA === detailReminder.id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.86L0 24l6.312-1.518A11.933 11.933 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.894 0-3.664-.53-5.17-1.447l-.37-.22-3.747.901.937-3.65-.24-.382A9.944 9.944 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                        Kirim WA
                      </button>
                    )}
                    {isAdmin && (
                      <button onClick={() => openEdit(detailReminder)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white"
                        style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        Edit
                      </button>
                    )}
                  </div>
                )}

              </div>

              {/* Bottom close button */}
              <div className="px-5 py-3 border-t border-slate-100 flex gap-2 flex-shrink-0">
                <button onClick={() => { setDetailReminder(null); setPendingStatus(null); setStatusPhoto(null); setStatusPhotoPreview(null); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                  Tutup
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ── HEADER ── */}
        <header className="sticky top-0 z-50" style={{ background: 'rgba(255,255,255,0.9)', borderBottom: '3px solid #dc2626', backdropFilter: 'blur(16px)' }}>
          <div className="max-w-[1600px] mx-auto px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)', boxShadow: '0 3px 12px rgba(220,38,38,0.4)' }}>
                <span className="text-lg">🗓️</span>
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-red-800">Reminder Schedule</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowBellPopup(true)}
                className="relative p-2 rounded-xl transition-all hover:bg-red-50 border-2 border-transparent hover:border-red-200">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {myActiveReminders.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ background: '#f59e0b' }}>
                    {myActiveReminders.length}
                  </span>
                )}
              </button>

              {canAddReminder && view === 'list' && (
                <button onClick={() => { setEditingReminder(null); setFormData(emptyForm); fetchTeamUsers(); setShowFormModal(true); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)', boxShadow: '0 4px 14px rgba(220,38,38,0.4)' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                  Tambah Reminder
                </button>
              )}

            </div>
          </div>
        </header>

        <div className="flex-1 max-w-[1600px] mx-auto w-full px-5 py-5 space-y-4">

          {/* ─── LIST VIEW ── */}
          {view === 'list' && (
            <>
              {/* ── Stat cards (clickable filter) ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: 'Total Jadwal', value: totalCount, sub: 'Semua reminder',
                    gradient: 'linear-gradient(135deg,#4f46e5,#6d28d9)', icon: '📋', shadow: 'rgba(79,70,229,0.35)',
                    onClick: () => { setFilterStatus('all'); setSelectedCalDay(null); },
                    active: filterStatus === 'all' && !selectedCalDay,
                  },
                  {
                    label: 'Pending', value: pendingCount, sub: 'Menunggu tindakan',
                    gradient: 'linear-gradient(135deg,#d97706,#b45309)', icon: '⏳', shadow: 'rgba(217,119,6,0.35)',
                    onClick: () => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending'),
                    active: filterStatus === 'pending',
                  },
                  {
                    label: 'Selesai', value: doneCount, sub: 'Terselesaikan',
                    gradient: 'linear-gradient(135deg,#059669,#047857)', icon: '✅', shadow: 'rgba(5,150,105,0.35)',
                    onClick: () => setFilterStatus(filterStatus === 'done' ? 'all' : 'done'),
                    active: filterStatus === 'done',
                  },
                  {
                    label: 'Hari Ini', value: todayCount, sub: 'Jadwal hari ini',
                    gradient: 'linear-gradient(135deg,#0891b2,#0e7490)', icon: '📅', shadow: 'rgba(8,145,178,0.35)',
                    onClick: () => setSelectedCalDay(selectedCalDay === new Date().toISOString().split('T')[0] ? null : new Date().toISOString().split('T')[0]),
                    active: selectedCalDay === new Date().toISOString().split('T')[0],
                  },
                ].map(card => (
                  <div key={card.label}
                    onClick={card.onClick}
                    className="rounded-2xl p-4 relative overflow-hidden flex flex-col gap-2 cursor-pointer transition-all hover:scale-[1.03] select-none"
                    style={{
                      background: card.gradient,
                      boxShadow: card.active ? `0 6px 24px ${card.shadow}` : `0 4px 16px ${card.shadow}`,
                      outline: card.active ? '3px solid white' : 'none',
                      transform: card.active ? 'scale(1.04)' : undefined,
                    }}>
                    <div className="absolute right-3 top-2 text-4xl opacity-[0.15] select-none">{card.icon}</div>
                    {card.active && (
                      <div className="absolute inset-0 rounded-2xl border-4 border-white/50 pointer-events-none" />
                    )}
                    <span className="text-3xl font-black text-white leading-none">{card.value}</span>
                    <div>
                      <p className="text-sm font-bold text-white leading-tight">{card.label}</p>
                      <p className="text-[10px] font-medium leading-tight" style={{ color: 'rgba(255,255,255,0.75)' }}>{card.sub}</p>
                    </div>
                    {card.active && <span className="absolute top-2 left-2 text-white/80 text-[9px] font-bold uppercase tracking-widest">Filter Aktif ✓</span>}
                  </div>
                ))}
              </div>

              {/* ── Pie Charts — klick untuk filter ── */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <MiniPieChart
                  data={projectPieData} title="Kegiatan / Kategori" icon="🖥️"
                  activeFilter={filterCategory !== 'all' ? filterCategory : null}
                  onSliceClick={label => setFilterCategory(filterCategory === label ? 'all' : label)}
                />
                <MiniPieChart
                  data={salesPieData} title="Divisi Sales" icon="👤"
                  activeFilter={searchDivisionSales || null}
                  onSliceClick={label => setSearchDivisionSales(searchDivisionSales === label ? '' : label)}
                />
                <MiniPieChart
                  data={teamPtsPieData} title="Team PTS" icon="👥"
                  activeFilter={searchTeamHandler || null}
                  onSliceClick={label => setSearchTeamHandler(searchTeamHandler === label ? '' : label)}
                />
                <MiniPieChart
                  data={productPieData} title="Product / Unit" icon="📦"
                  activeFilter={productFilter}
                  onSliceClick={label => setProductFilter(productFilter === label ? null : label)}
                />
              </div>

              {/* Active filter chips */}
              {/* Main area: list + calendar */}
              <div className="flex gap-4 items-start">

                {/* ── TICKET LIST ── */}
                <div className="flex-1 min-w-0 rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(200,200,200,0.6)', backdropFilter: 'blur(12px)' }}>

                  {/* ── TICKET LIST header + refresh/export ── */}
                  <div className="flex flex-wrap items-center justify-between px-5 py-3.5 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Schedule List</span>
                      <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full">{filteredReminders.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {(isAdmin || currentUser?.role === 'superadmin') && (
                        <button onClick={() => { setSelectMode(m => !m); setSelectedIds(new Set()); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${selectMode ? 'bg-red-50 border-red-300 text-red-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          {selectMode ? '✕ Batal' : '☑ Select'}
                        </button>
                      )}
                      <button onClick={fetchReminders} disabled={listLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-gray-100 border border-gray-200 text-gray-600 disabled:opacity-60 bg-white">
                        <svg className={`w-3.5 h-3.5 ${listLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        Refresh
                      </button>
                      <button onClick={handleExportExcel} disabled={exportLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-105"
                        style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)', boxShadow: '0 2px 8px rgba(220,38,38,0.3)' }}>
                        {exportLoading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '📊'}
                        Export
                      </button>
                    </div>
                  </div>

                  {/* ── Search / Filter bar — tepat di bawah TICKET LIST ── */}
                  <div className="px-5 py-3 border-b border-gray-100" style={{ background: 'rgba(255,255,255,0.97)' }}>
                    <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Search Project / Location</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]">🔍</span>
                          <input value={searchProject} onChange={e => setSearchProject(e.target.value)}
                            className="w-full rounded-lg pl-7 pr-3 py-1.5 text-xs outline-none bg-gray-50 border border-gray-200 focus:bg-white focus:border-red-300 transition-all"
                            placeholder="Search project / lokasi..." />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Search Sales Name</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]">👤</span>
                          <input value={searchSales} onChange={e => setSearchSales(e.target.value)}
                            className="w-full rounded-lg pl-7 pr-3 py-1.5 text-xs outline-none bg-gray-50 border border-gray-200 focus:bg-white focus:border-red-300 transition-all"
                            placeholder="Search sales..." />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">📦 Product</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]">📦</span>
                          <input value={searchProduct} onChange={e => { setSearchProduct(e.target.value); setProductFilter(null); }}
                            className="w-full rounded-lg pl-7 pr-3 py-1.5 text-xs outline-none bg-gray-50 border border-gray-200 focus:bg-white focus:border-red-300 transition-all"
                            placeholder="Cari product..." />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Team Handler</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]">👷</span>
                          <input value={searchTeamHandler} onChange={e => setSearchTeamHandler(e.target.value)}
                            className="w-full rounded-lg pl-7 pr-3 py-1.5 text-xs outline-none bg-gray-50 border border-gray-200 focus:bg-white focus:border-purple-300 transition-all"
                            placeholder="Search handler..." />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Status</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]">🏷️</span>
                          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
                            className="w-full rounded-lg pl-7 pr-3 py-1.5 text-xs outline-none bg-gray-50 border border-gray-200 focus:bg-white focus:border-red-300 appearance-none cursor-pointer transition-all">
                            <option value="all">All Status</option>
                            {(Object.keys(STATUS_CONFIG) as Status[]).map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
                          </select>
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none">▼</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Filter Year</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]">📅</span>
                          <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
                            className="w-full rounded-lg pl-7 pr-3 py-1.5 text-xs outline-none bg-gray-50 border border-gray-200 focus:bg-white focus:border-red-300 appearance-none cursor-pointer transition-all">
                            <option value="all">All Years</option>
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                          </select>
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none">▼</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bulk delete bar — admin only, selectMode only */}
                  {selectMode && (isAdmin || currentUser?.role === 'superadmin') && selectedIds.size > 0 && (
                    <div className="px-5 py-2.5 flex items-center justify-between border-b border-gray-200" style={{ background: 'rgba(220,38,38,0.07)' }}>
                      <span className="text-sm font-bold text-red-700">{selectedIds.size} jadwal dipilih</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">Batal Pilih</button>
                        <button onClick={() => setBulkConfirm(true)} disabled={bulkDeleting}
                          className="text-xs font-bold text-white px-4 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1"
                          style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                          {bulkDeleting ? '⏳ Menghapus...' : `🗑️ Hapus ${selectedIds.size}`}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Filter Aktif chips — di bawah filter bar ── */}
                  {(filterCategory !== 'all' || filterStatus !== 'all' || searchSales || searchDivisionSales || searchTeamHandler || searchProject || selectedCalDay || productFilter || searchProduct) && (
                    <div className="px-5 py-2.5 border-b border-gray-100 flex flex-wrap gap-2 items-center" style={{ background: 'rgba(255,255,255,0.97)' }}>
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Filter Aktif:</span>
                      {filterCategory !== 'all' && <button onClick={() => setFilterCategory('all')} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white transition-all hover:opacity-80" style={{ background: '#7c3aed' }}>🏷️ {filterCategory} ✕</button>}
                      {filterStatus !== 'all' && <button onClick={() => setFilterStatus('all')} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white transition-all hover:opacity-80" style={{ background: '#d97706' }}>Status: {STATUS_CONFIG[filterStatus as Status]?.label} ✕</button>}
                      {searchSales && <button onClick={() => setSearchSales('')} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white transition-all hover:opacity-80" style={{ background: '#475569' }}>👤 {searchSales} ✕</button>}
                      {searchDivisionSales && <button onClick={() => setSearchDivisionSales('')} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white transition-all hover:opacity-80" style={{ background: '#ec4899' }}>Division: {searchDivisionSales} ✕</button>}
                      {searchTeamHandler && <button onClick={() => setSearchTeamHandler('')} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white transition-all hover:opacity-80" style={{ background: '#7c3aed' }}>👷 {searchTeamHandler} ✕</button>}
                      {searchProject && <button onClick={() => setSearchProject('')} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white transition-all hover:opacity-80" style={{ background: '#475569' }}>🔍 {searchProject} ✕</button>}
                      {productFilter && <button onClick={() => { setProductFilter(null); setSearchProduct(''); }} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white transition-all hover:opacity-80" style={{ background: '#6366f1' }}>📦 {productFilter} ✕</button>}
                      {selectedCalDay && <button onClick={() => setSelectedCalDay(null)} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white transition-all hover:opacity-80" style={{ background: '#0891b2' }}>📅 {formatDate(selectedCalDay)} ✕</button>}
                      <button onClick={() => { setFilterCategory('all'); setFilterStatus('all'); setSearchSales(''); setSearchDivisionSales(''); setSearchTeamHandler(''); setSearchProject(''); setSelectedCalDay(null); setProductFilter(null); setSearchProduct(''); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all hover:opacity-80" style={{ background: 'rgba(220,38,38,0.12)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.25)' }}>🗑️ Reset Semua</button>
                    </div>
                  )}

                  {/* ── TABLE ── */}
                  {listLoading ? (
                    <div className="space-y-2 p-4">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="animate-pulse flex gap-3 items-center bg-white/60 rounded-xl p-3 border border-gray-200">
                          <div className="flex-1 space-y-2"><div className="h-3 bg-gray-200 rounded w-2/5"></div><div className="h-2 bg-gray-100 rounded w-1/4"></div></div>
                          <div className="h-3 bg-gray-200 rounded w-1/6"></div><div className="h-3 bg-gray-200 rounded w-1/5"></div>
                          <div className="h-5 bg-gray-200 rounded-full w-16"></div><div className="h-6 bg-gray-200 rounded-lg w-14"></div>
                        </div>
                      ))}
                    </div>
                  ) : filteredReminders.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-5xl mb-3">📭</div>
                      <p className="text-gray-600 font-semibold text-sm">Tidak ada reminder ditemukan</p>
                      <p className="text-xs text-gray-400 mt-1">Coba ubah filter atau tambahkan reminder baru</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse" style={{ tableLayout: 'fixed', background: 'transparent' }}>
                        <colgroup>
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '13%' }} />
                          <col style={{ width: '12%' }} />
                          <col style={{ width: '10%' }} />
                          <col style={{ width: '6%' }} />
                          <col style={{ width: '9%' }} />
                          <col style={{ width: '7%' }} />
                          <col style={{ width: '9%' }} />
                          <col style={{ width: '6%' }} />
                          <col style={{ width: '8%' }} />
                        </colgroup>
                        <thead>
                          <tr style={{ background: 'linear-gradient(90deg,rgba(220,38,38,0.06),rgba(220,38,38,0.02))', borderBottom: '2px solid rgba(220,38,38,0.15)' }}>
                            <th className="px-3 py-3 text-center text-[10px] font-black text-red-400 uppercase tracking-wider border-r border-red-50">
                      {selectMode && (isAdmin || currentUser?.role === 'superadmin')
                        ? <input type="checkbox"
                            checked={selectedIds.size === filteredReminders.length && filteredReminders.length > 0}
                            onChange={toggleSelectAll} className="w-4 h-4 rounded accent-red-600 cursor-pointer" title="Pilih Semua" />
                        : '#'}
                    </th>
                            <th className="px-3 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider border-r border-red-50">Project</th>
                            <th className="px-3 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider border-r border-red-50">Product</th>
                            <th className="px-3 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider border-r border-red-50">Kegiatan</th>
                            <th className="px-3 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider border-r border-red-50">Sales</th>
                            <th className="px-3 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider border-r border-red-50">Handler</th>
                            <th className="px-3 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider border-r border-red-50">PIC</th>
                            <th className="px-3 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider border-r border-red-50">Status</th>
                            <th className="px-3 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider border-r border-red-50">Tanggal</th>
                            <th className="px-2 py-3 text-center text-[10px] font-black text-slate-500 uppercase tracking-wider">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredReminders.map((r, idx) => {
                            const today = isDueToday(r.due_date);
                            return (
                              <tr key={r.id}
                                className={`border-b transition-colors cursor-pointer ${today ? 'bg-red-50/30 border-l-[3px] border-l-red-400' : idx % 2 === 0 ? 'bg-white border-l-[3px] border-l-transparent' : 'bg-slate-50/50 border-l-[3px] border-l-transparent'} hover:bg-red-50/20`}
                                style={{ borderBottomColor: 'rgba(0,0,0,0.05)' }}
                                >
                                {/* No */}
                                <td className="px-3 py-3 border-r border-slate-100/60 align-middle text-center" onClick={e => e.stopPropagation()}>
                            {selectMode && (isAdmin || currentUser?.role === 'superadmin')
                              ? <input type="checkbox" checked={selectedIds.has(r.id)}
                                  onChange={() => toggleSelectId(r.id)} className="w-4 h-4 rounded accent-red-600 cursor-pointer" />
                              : <span className="text-[11px] font-bold text-gray-500">{idx + 1}</span>}
                          </td>
                                {/* Project */}
                                <td className="px-3 py-3 border-r border-slate-100/60 align-middle">
                                  <div className="font-bold text-gray-800 text-xs leading-tight break-words">{(r.project_name || '').trim() || (r.title || '').trim() || '—'}</div>
                                  {r.address && <div className="text-[10px] text-gray-400 truncate mt-0.5">📍 {r.address.split(',')[0]}</div>}
                                  <div className="text-[10px] text-gray-400 mt-0.5">{formatDatetime(r.created_at).split(',')[0]}</div>
                                </td>
                                {/* Product */}
                                <td className="px-3 py-3 border-r border-slate-100/60 align-middle">
                                  {r.product ? (
                                    <button
                                      onClick={e => { e.stopPropagation(); setProductFilter(productFilter === r.product ? null : (r.product ?? null)); }}
                                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-left break-words leading-tight transition-all"
                                      style={{ background: productFilter === r.product ? '#6366f1' : '#eef2ff', color: productFilter === r.product ? 'white' : '#4338ca' }}>
                                      {r.product}
                                    </button>
                                  ) : <span className="text-gray-300 text-xs">—</span>}
                                </td>
                                {/* Kegiatan */}
                                <td className="px-3 py-3 border-r border-slate-100/60 align-middle">
                                  <div className="flex items-center gap-1">
                                    <span className="text-sm">{(CATEGORY_CONFIG[r.category] ?? { icon: '📁' }).icon}</span>
                                    <span className="text-[10px] font-semibold text-gray-700 leading-tight break-words">{r.category}</span>
                                    {r.sales_name && (REVIEW_TRIGGER_CATEGORIES as readonly string[]).includes(r.category) && (
                                    <div className="inline-flex items-center gap-1 mt-1 px-1.5 py-1"
                                      >
                                      ⭐ {/*r.sales_name*/}
                                    </div>
                                  )}
                                  </div>
                                  {r.category === 'Troubleshooting' && (
                                    <button
                                      onClick={e => { e.stopPropagation(); router.push('/ticketing'); }}
                                      className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded text-blue-600 hover:text-blue-800 transition-colors"
                                      style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                                      🎫 Ticketing
                                    </button>
                                  )}
                                </td>
                                {/* Sales */}
                                <td className="px-3 py-3 border-r border-slate-100/60 align-middle">
                                  <div className="text-xs font-semibold text-gray-700 leading-tight truncate">{r.sales_name || '—'}</div>
                                  {r.sales_division && <div className="text-[10px] text-purple-600 font-semibold truncate mt-0.5">{r.sales_division}</div>}
                                </td>
                                {/* Handler */}
                                <td className="px-3 py-3 border-r border-slate-100/60 align-middle">
                                  <div className="flex items-center gap-1">
                                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                                      style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)' }}>
                                      {r.assign_name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-800 truncate">{r.assign_name}</span>
                                  </div>
                                </td>
                                {/* PIC */}
                                <td className="px-3 py-3 border-r border-slate-100/60 align-middle">
                                  {r.pic_name ? (
                                    <>
                                      <div className="text-[10px] font-semibold text-gray-700 truncate">{r.pic_name}</div>
                                      {r.pic_phone && <div className="text-[10px] text-gray-400 truncate">📱{r.pic_phone}</div>}
                                    </>
                                  ) : <span className="text-gray-300 text-xs">—</span>}
                                </td>
                                {/* Status */}
                                <td className="px-3 py-3 border-r border-slate-100/60 align-middle">
                                  <StatusBadge status={r.status} />
                                  {r.wa_sent_h1 && <p className="text-[9px] font-bold text-green-600 mt-0.5">✅ WA H-1</p>}
                                </td>
                                {/* Tanggal */}
                                <td className="px-2 py-1 border-r border-slate-100/60 align-middle">
                                  <div className="inline-flex flex-col items-center px-2 py-1 rounded-lg text-center"
                                    style={{
                                      background: today ? 'rgba(220,38,38,0.12)' : 'rgba(99,102,241,0.08)',
                                      border: today ? '1px solid rgba(220,38,38,0.35)' : '1px solid rgba(99,102,241,0.2)',
                                    }}>
                                    <span className="text-base font-black leading-none" style={{ color: today ? '#dc2626' : '#4f46e5' }}>
                                      {new Date(r.due_date + 'T00:00:00').getDate()}
                                    </span>
                                    <span className="text-[8px] font-bold uppercase leading-tight" style={{ color: today ? '#dc2626' : '#6366f1' }}>
                                      {new Date(r.due_date + 'T00:00:00').toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })}
                                    </span>
                                    {r.due_time && <span className="text-[8px] text-gray-400 leading-tight">{r.due_time}</span>}
                                  </div>
                                </td>
                                {/* ACT */}
                                <td className="px-3 py-1 align-middle text-center border-r-0" onClick={e => e.stopPropagation()}>
                                  <div className="flex flex-nowrap items-center justify-center gap-1">
                                    {/* Eye icon */}
                                    <button onClick={() => setDetailReminder(r)} title="Lihat Detail"
                                      className="p-1.5 rounded-lg transition-all hover:bg-slate-100"
                                      style={{ color: '#94a3b8' }}
                                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#3b82f6'}
                                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'}>
                                      <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                      </svg>
                                    </button>
                                    {/* Print icon */}
                                    {(isAdmin || currentUser?.role === 'team') && (
                                      <button onClick={() => printReminder(r)} title="Print"
                                        className="p-1.5 rounded-lg transition-all hover:bg-slate-100"
                                        style={{ color: '#94a3b8' }}
                                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#64748b'}
                                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'}>
                                        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                                        </svg>
                                      </button>
                                    )}
                                    {/* Trash icon - admin only */}
                                    {isAdmin && (
                                      <button onClick={() => openDeleteModal(r)} title="Hapus"
                                        className="p-1.5 rounded-lg transition-all hover:bg-red-50"
                                        style={{ color: '#94a3b8' }}
                                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'}>
                                        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-200" style={{ background: 'rgba(255,255,255,0.97)' }}>
                        <span className="text-[10px] text-gray-400">{filteredReminders.length} jadwal ditemukan</span>
                        <span className="text-[10px] text-gray-400">{filteredReminders.length > 0 ? `1–${filteredReminders.length}` : '0'} of {reminders.length}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── MINI CALENDAR SIDEBAR ── */}
                <MiniCalendar
                  reminders={reminders}
                  calendarMonth={calendarMonth}
                  setCalendarMonth={setCalendarMonth}
                  selectedCalDay={calOnlyDay}
                  setSelectedCalDay={setCalOnlyDay}
                />
              </div>
            </>
          )}

          {/* ─── FORM VIEW ── (digantikan oleh showFormModal popup) */}

        </div>

      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity:0; transform:translateY(14px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes scale-in {
          from { opacity:0; transform:scale(0.92); }
          to   { opacity:1; transform:scale(1); }
        }
        @keyframes slide-in-right {
          from { opacity:0; transform:translateX(32px); }
          to   { opacity:1; transform:translateX(0); }
        }
        select option { background: #ffffff; color: #1e293b; }
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(0.3); cursor: pointer; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(220,38,38,0.25); border-radius: 4px; }
      `}</style>
    </div>
  );
}
