// ─── Design Tokens & Shared Styles ────────────────────────────
// Netlify CPQ visual system. Rams-inspired: minimal, functional, honest.

export const COLORS = {
  bg: '#0a0e17',
  surface: '#111827',
  border: '#1e2636',
  borderLight: '#141c2b',
  text: '#c8cdd7',
  textStrong: '#f0f2f5',
  textMuted: '#6b7280',
  textFaint: '#4b5563',
  accent: '#00c7b7',
  accentDark: '#00a99d',
  blue: '#3b82f6',
  amber: '#f59e0b',
  purple: '#8b5cf6',
  green: '#22c55e',
  red: '#ef4444',
  pink: '#ec4899',
};

export const CAT_COLORS = {
  Platform: COLORS.blue,
  Bandwidth: COLORS.amber,
  'Add-ons': COLORS.purple,
  Support: COLORS.green,
  Security: COLORS.red,
  Integrations: COLORS.pink,
};

export const fmtPrice = (v) => {
  if (!v || v === 0) return 'Custom';
  return v < 1
    ? `$${v.toFixed(2)}`
    : `$${v.toLocaleString('en-US')}`;
};

// ─── Shared Style Objects ─────────────────────────────────────
export const S = {
  // Layout
  root: { fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif", background: COLORS.bg, color: COLORS.text, minHeight: '100vh' },
  wrap: { maxWidth: 1100, margin: '0 auto', padding: '32px 24px' },

  // Header
  header: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 },
  logo: { width: 34, height: 34, borderRadius: 8, background: `linear-gradient(135deg,${COLORS.accent},${COLORS.blue})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15 },
  h1: { fontSize: 22, fontWeight: 700, color: COLORS.textStrong, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: COLORS.textMuted, marginBottom: 28 },

  // Tabs
  tabs: { display: 'flex', gap: 0, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 24 },
  tab: (a) => ({ padding: '10px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', color: a ? COLORS.accent : COLORS.textMuted, borderBottom: `2px solid ${a ? COLORS.accent : 'transparent'}`, transition: 'all .15s', fontFamily: 'inherit' }),
  tabN: (a) => ({ marginLeft: 6, fontSize: 11, padding: '1px 7px', borderRadius: 10, background: a ? 'rgba(0,199,183,.15)' : 'rgba(255,255,255,.06)', color: a ? COLORS.accent : COLORS.textMuted }),

  // Toolbar
  bar: { display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' },
  searchWrap: { flex: 1, minWidth: 180, display: 'flex', alignItems: 'center', gap: 8, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 12px' },
  searchIn: { background: 'none', border: 'none', outline: 'none', color: COLORS.text, fontSize: 13, width: '100%', fontFamily: 'inherit' },
  fBtn: (a) => ({ padding: '7px 14px', fontSize: 12, borderRadius: 7, border: `1px solid ${a ? COLORS.accent : COLORS.border}`, background: a ? 'rgba(0,199,183,.1)' : COLORS.surface, color: a ? COLORS.accent : '#8b95a5', cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }),
  addBtn: { padding: '8px 18px', fontSize: 13, borderRadius: 8, border: 'none', background: `linear-gradient(135deg,${COLORS.accent},${COLORS.accentDark})`, color: '#fff', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 },

  // Table
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0 },
  th: { textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, borderBottom: `1px solid ${COLORS.border}` },
  td: { padding: '12px 14px', fontSize: 13, borderBottom: `1px solid ${COLORS.borderLight}`, verticalAlign: 'middle' },
  name: { fontWeight: 600, color: COLORS.textStrong },
  sku: { fontSize: 11, color: COLORS.textFaint, fontFamily: 'monospace' },
  badge: (c) => ({ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 5, background: c + '18', color: c }),
  pP: { fontWeight: 600, color: COLORS.textStrong, fontSize: 14 },
  pU: { fontSize: 11, color: COLORS.textMuted },
  dot: (on) => ({ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: on ? COLORS.green : COLORS.textFaint, marginRight: 6 }),
  aBtn: { background: 'none', border: 'none', color: COLORS.textFaint, cursor: 'pointer', padding: 4, borderRadius: 4 },

  // Modal
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: '28px 30px', width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' },
  mTitle: { fontSize: 17, fontWeight: 700, color: COLORS.textStrong, marginBottom: 22 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#8b95a5', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { width: '100%', padding: '9px 12px', fontSize: 13, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 7, color: COLORS.textStrong, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '9px 12px', fontSize: 13, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 7, color: COLORS.textStrong, outline: 'none', fontFamily: 'inherit', minHeight: 60, resize: 'vertical', boxSizing: 'border-box' },
  select: { width: '100%', padding: '9px 12px', fontSize: 13, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 7, color: COLORS.textStrong, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
  r2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  r3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },
  mActs: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 },
  canBtn: { padding: '9px 20px', fontSize: 13, borderRadius: 8, border: `1px solid ${COLORS.border}`, background: 'none', color: '#8b95a5', cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' },
  saveBtn: { padding: '9px 22px', fontSize: 13, borderRadius: 8, border: 'none', background: `linear-gradient(135deg,${COLORS.accent},${COLORS.accentDark})`, color: '#fff', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' },

  // Bundle pick list
  pickList: { maxHeight: 200, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.bg },
  pickItem: (sel) => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', fontSize: 13, cursor: 'pointer', background: sel ? 'rgba(0,199,183,.08)' : 'transparent', borderBottom: `1px solid ${COLORS.borderLight}` }),
  chip: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, background: 'rgba(0,199,183,.12)', color: COLORS.accent, fontSize: 12, fontWeight: 500, marginRight: 6, marginBottom: 4 },
  chipX: { cursor: 'pointer', fontWeight: 700, marginLeft: 2 },

  // Empty
  empty: { textAlign: 'center', padding: '48px 20px', color: COLORS.textFaint },
};
