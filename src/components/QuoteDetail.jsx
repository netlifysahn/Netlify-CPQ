import React, { useState, useRef, useEffect, useMemo, Component } from 'react';
import {
  calcQuoteTotals, calcLineExtended, calcLineMonthly,
  fmtCurrency, STATUS_META, emptyLineItem, emptyGroup,
  emptyPackageLine, emptySubLineItem,
  syncDiscountFromPercent, syncDiscountFromAmount,
  isQuantityEditable, isIncluded, getUnitLabel,
} from '../data/quotes';
import { isBundleProduct, TYPE_LABELS, getProductCategory } from '../data/catalog';
import { generateQuotePdf } from '../utils/quotePdf';
import ProductPicker from './ProductPicker';

// Error boundary to catch render crashes and show them instead of blank screen
class QuoteDetailErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[QuoteDetail] Render crash:', error, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40 }}>
          <button className="back-btn" onClick={this.props.onBack}>
            Back to Quotes
          </button>
          <h2 style={{ marginTop: 20, color: '#ef4444' }}>Something went wrong</h2>
          <pre style={{ marginTop: 12, padding: 16, background: 'rgba(0,0,0,0.05)', borderRadius: 8, whiteSpace: 'pre-wrap', fontSize: 13 }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Animated summary value — pulses on change
function AnimatedValue({ value, pulseKey }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || pulseKey === 0) return;
    el.classList.remove('value-changed');
    void el.offsetWidth;
    el.classList.add('value-changed');
  }, [pulseKey]);
  return <div className="qd-summary-value" ref={ref}>{value}</div>;
}

// Relative time — "2 days ago", "just now", etc.
const relativeTime = (timestamp) => {
  if (!timestamp) return '';
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  return `${Math.floor(diffMo / 12)}y ago`;
};

// Status dot colors for activity timeline
const ACTIVITY_DOT_COLORS = {
  draft: '#6b7280', sent: '#2E51ED', draft_revision: '#FBB13D',
  ready_to_submit: '#00AD9F', pending_approval: '#7C3AED',
  approved: '#059669', rejected: '#ef4444', converted: '#065f46',
  archived: '#9ca3af',
};

// Format date — "2026-03-08" → "Mar 8, 2026"
const fmtDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Display currency — show dash for zero values in line tables
const displayCurrency = (v) => {
  const n = typeof v === 'number' && !isNaN(v) ? v : 0;
  return n === 0 ? '—' : fmtCurrency(n);
};

// Format quantity with comma separators — 1000000 → "1,000,000"
const fmtQty = (v) => {
  const n = typeof v === 'number' && !isNaN(v) ? v : 0;
  return n.toLocaleString('en-US');
};

// ── Category badge styles for grouped line item cards ──
const CATEGORY_BADGE_STYLES = {
  bundle: { background: 'transparent', color: '#0a0a0a', border: '1px solid #0a0a0a' },
  support: { background: '#EFF6FF', color: '#2E51ED', border: '1px solid #BFDBFE' },
  platform: { background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' },
  addon: { background: '#FAF5FF', color: '#7C3AED', border: '1px solid #E9D5FF' },
  entitlements: { background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' },
};

const CARD_ORDER_WITH_PACKAGE = ['bundle', 'support', 'addon', 'entitlements'];
const CARD_ORDER_NO_PACKAGE = ['platform', 'entitlements', 'support', 'addon'];

const getCategoryCardLabel = (category, hasPackage) => {
  if (category === 'entitlements' && hasPackage) return 'Additional Entitlements';
  return TYPE_LABELS[category] || category;
};

// ── Detail card styles (shared constants) ──
const DC_LABEL_STYLE = { fontSize: '14px', color: '#0f172a', fontWeight: 500, fontFamily: "'Mulish', sans-serif", marginBottom: '6px' };
const DC_INPUT_STYLE = { fontSize: '14px', color: '#0a0a0a', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 14px', width: '100%', outline: 'none', boxSizing: 'border-box', background: '#fff', transition: 'border-color 0.15s' };

const handleDcFocus = (e) => { e.target.style.borderColor = '#FBB13D'; };
const handleDcBlurStyle = (e) => { e.target.style.borderColor = '#e5e7eb'; };

// Top-level component to avoid remount on parent state change
function DetailInput({ label, field, value, placeholder, span2, type, mono, textarea, options, onChange, onBlur }) {
  const style = mono ? { ...DC_INPUT_STYLE, fontFamily: "'Roboto Mono', monospace" } : DC_INPUT_STYLE;
  const handleChange = (e) => onChange(field, e.target.value);
  const handleBlur = (e) => { handleDcBlurStyle(e); onBlur(field, e.target.value); };
  let input;
  if (textarea) {
    input = <textarea style={{ ...style, resize: 'vertical', minHeight: '60px' }} value={value || ''} placeholder={placeholder} onChange={handleChange} onFocus={handleDcFocus} onBlur={handleBlur} />;
  } else if (options) {
    input = (
      <select style={{ ...style, appearance: 'auto', cursor: 'pointer' }} value={value || ''} onChange={(e) => { handleChange(e); onBlur(field, e.target.value); }} onFocus={handleDcFocus} onBlur={(e) => handleDcBlurStyle(e)}>
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  } else {
    input = <input type={type || 'text'} style={style} value={value || ''} placeholder={placeholder} onChange={handleChange} onFocus={handleDcFocus} onBlur={handleBlur} />;
  }
  return (
    <div style={span2 ? { gridColumn: '1 / -1' } : undefined}>
      <div style={DC_LABEL_STYLE}>{label}</div>
      {input}
    </div>
  );
}

// Backfill missing fields on older quotes
const normalizeQuote = (q) => {
  if (!q || typeof q !== 'object') {
    return { id: 'error', quote_number: 'ERR', name: 'Invalid Quote', status: 'draft', term_months: 12, header_discount: 0, line_items: [], groups: [], start_date: '', end_date: '', customer_name: '', customer_address: '', customer_contact: '', billing_contact_name: '', billing_contact_email: '', billing_contact_phone: '', prepared_by: '', comments: '', terms_conditions: '', pricebook_id: null, created_at: '', updated_at: '' };
  }
  return {
    ...q,
    status: q.status || 'draft',
    term_months: q.term_months || 12,
    header_discount: q.header_discount || 0,
    line_items: (q.line_items || []).map((l) => ({
      ...l,
      unit_type: l.unit_type || 'flat',
      quantity: l.quantity ?? 1,
      list_price: l.list_price ?? l.sales_price ?? 0,
      discount_percent: l.discount_percent ?? 0,
      discount_amount: l.discount_amount ?? 0,
      net_price: l.net_price ?? l.list_price ?? l.sales_price ?? 0,
      product_name: l.product_name || l.name || 'Unknown Product',
      product_sku: l.product_sku || l.sku || '',
      is_package: l.is_package || false,
      parent_line_id: l.parent_line_id || null,
      price_behavior: l.price_behavior || (l.parent_line_id ? 'included' : undefined),
    })),
    groups: q.groups || [],
    overage_rate_credits: q.overage_rate_credits || '',
    overage_rate_seats: q.overage_rate_seats || '',
    activity_log: q.activity_log || [{ type: 'created', timestamp: q.created_at || new Date().toISOString(), note: 'Quote created', actor: q.prepared_by || '' }],
  };
};

export default function QuoteDetail(props) {
  return (
    <QuoteDetailErrorBoundary onBack={props.onBack}>
      <QuoteDetailInner {...props} />
    </QuoteDetailErrorBoundary>
  );
}

function QuoteDetailInner({ quote, products, pricebooks, onSave, onBack, onDelete, onClone }) {
  const [q, setQ] = useState(() => normalizeQuote(quote));
  const [mode, setMode] = useState('view'); // 'view' | 'edit'
  const [draft, setDraft] = useState(null); // working copy in edit mode
  const [showPicker, setShowPicker] = useState(false);
  const [editingCell, setEditingCell] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [collapsedPkgs, setCollapsedPkgs] = useState(new Set());
  const [detailCards, setDetailCards] = useState({ customer: false, term: false, billing: false, overage: false, activity: false });
  const [addingToPackageId, setAddingToPackageId] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [feedbackModal, setFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [ddNotesModal, setDdNotesModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState(null);
  const [toast, setToast] = useState(null);
  const dragRef = useRef(null); // { type: 'top'|'sub', id, parentId? }
  const moreRef = useRef(null);
  const prevTotalsRef = useRef(null);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setShowMoreMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Persist (view-mode status changes) ──
  const persistQuote = (fn) => {
    setQ((prev) => {
      const next = fn(prev);
      next.updated_at = new Date().toISOString();
      onSave(next);
      return next;
    });
  };

  // ── Edit mode: enter / save / cancel ──
  const enterEditMode = () => {
    setDraft({
      line_items: JSON.parse(JSON.stringify(q.line_items)),
      groups: JSON.parse(JSON.stringify(q.groups)),
      header_discount: q.header_discount || 0,
    });
    setEditingCell(null);
    setMode('edit');
  };

  const saveEdit = () => {
    const updated = {
      ...q,
      line_items: draft.line_items,
      groups: draft.groups,
      header_discount: draft.header_discount,
      updated_at: new Date().toISOString(),
    };
    setQ(updated);
    onSave(updated);
    setDraft(null);
    setEditingCell(null);
    setMode('view');
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditingCell(null);
    setMode('view');
  };

  // ── Draft mutation helpers (edit mode only) ──
  const updateDraft = (fn) => {
    setDraft((prev) => fn({ ...prev }));
  };

  const getSelectedPricebook = () => {
    if (!q.pricebook_id) return null;
    return (pricebooks || []).find((pb) => pb.id === q.pricebook_id) || null;
  };

  const availableProducts = (() => {
    const pb = getSelectedPricebook();
    if (!pb || !pb.entries?.length) return products;
    const pbProductIds = new Set(pb.entries.map((e) => e.product_id));
    return products.filter((p) => pbProductIds.has(p.id));
  })();

  const addLineToDraft = (product) => {
    const pb = getSelectedPricebook();
    const getPriceOverride = (prodId) => {
      const entry = pb?.entries?.find((e) => e.product_id === prodId);
      return entry?.price_override != null ? entry.price_override : undefined;
    };

    if (isBundleProduct(product) && product.members?.length > 0) {
      const parentLine = emptyPackageLine(product);
      const productMap = new Map((products || []).map((p) => [p.id, p]));
      const subLines = product.members
        .filter((m) => productMap.has(m.product_id))
        .map((m) => emptySubLineItem(productMap.get(m.product_id), m, parentLine.id, getPriceOverride(m.product_id)));

      updateDraft((d) => {
        const base = d.line_items.length;
        d.line_items = [
          ...d.line_items,
          { ...parentLine, sort_order: base },
          ...subLines.map((sl, i) => ({ ...sl, sort_order: base + 1 + i })),
        ];
        return d;
      });
    } else {
      const line = emptyLineItem(product, getPriceOverride(product.id));
      updateDraft((d) => {
        d.line_items = [...d.line_items, { ...line, sort_order: d.line_items.length }];
        return d;
      });
    }
  };

  const updateDraftLine = (lineId, updates) => {
    updateDraft((d) => {
      d.line_items = d.line_items.map((l) => l.id === lineId ? { ...l, ...updates } : l);
      return d;
    });
    setEditingCell(null);
  };

  const updateDraftLineField = (lineId, field, value) => {
    if (field === 'list_price') {
      const line = draft.line_items.find((l) => l.id === lineId);
      if (!line) return;
      const newList = Math.max(0, value);
      const synced = syncDiscountFromPercent(newList, line.discount_percent || 0);
      updateDraftLine(lineId, { list_price: newList, ...synced });
      return;
    }
    updateDraftLine(lineId, { [field]: value });
  };

  const updateDraftDiscount = (lineId, field, value) => {
    const line = draft.line_items.find((l) => l.id === lineId);
    if (!line) return;
    const val = parseFloat(value) || 0;
    const synced = field === 'discount_percent'
      ? syncDiscountFromPercent(line.list_price || 0, val)
      : syncDiscountFromAmount(line.list_price || 0, val);
    updateDraftLine(lineId, synced);
  };

  const addSubComponentToDraft = (product, parentLineId) => {
    const pb = getSelectedPricebook();
    const entry = pb?.entries?.find((e) => e.product_id === product.id);
    const listPrice = entry?.price_override != null ? entry.price_override : undefined;
    const member = { product_id: product.id, qty: 1, unit_type: product.default_price?.unit || 'flat', list_price: product.default_price?.amount ?? 0 };
    const subLine = emptySubLineItem(product, member, parentLineId, listPrice);
    updateDraft((d) => {
      // Insert after last sub-component of this package
      const parentIdx = d.line_items.findIndex((l) => l.id === parentLineId);
      let insertIdx = parentIdx + 1;
      while (insertIdx < d.line_items.length && d.line_items[insertIdx].parent_line_id === parentLineId) {
        insertIdx++;
      }
      const items = [...d.line_items];
      items.splice(insertIdx, 0, { ...subLine, sort_order: insertIdx });
      d.line_items = items;
      return d;
    });
    setAddingToPackageId(null);
  };

  const removeDraftLine = (lineId) => {
    updateDraft((d) => {
      d.line_items = d.line_items.filter((l) => l.id !== lineId && l.parent_line_id !== lineId);
      return d;
    });
  };

  const addDraftGroup = () => {
    if (!groupName.trim()) return;
    updateDraft((d) => {
      d.groups = [...d.groups, { ...emptyGroup(), name: groupName.trim(), sort_order: d.groups.length }];
      return d;
    });
    setGroupName('');
    setShowGroupModal(false);
  };

  const removeDraftGroup = (groupId) => {
    updateDraft((d) => {
      d.groups = d.groups.filter((g) => g.id !== groupId);
      d.line_items = d.line_items.map((l) => l.group_id === groupId ? { ...l, group_id: null } : l);
      return d;
    });
  };

  // ── Drag and drop reordering (edit mode) ──
  const handleDragStart = (e, lineId, type, parentId) => {
    dragRef.current = { type, id: lineId, parentId };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', lineId);
    requestAnimationFrame(() => {
      const row = e.target.closest('tr');
      if (row) row.classList.add('drag-active');
    });
  };

  const handleDragEnd = (e) => {
    dragRef.current = null;
    setDropTargetId(null);
    document.querySelectorAll('.drag-active').forEach((el) => el.classList.remove('drag-active'));
  };

  const handleDragOver = (e, targetId, targetType, targetParentId) => {
    e.preventDefault();
    const drag = dragRef.current;
    if (!drag || drag.id === targetId) { setDropTargetId(null); return; }
    // Sub-components can only reorder within their parent
    if (drag.type === 'sub' && (targetType !== 'sub' || targetParentId !== drag.parentId)) { setDropTargetId(null); return; }
    // Top-level items can only reorder among top-level
    if (drag.type === 'top' && targetType !== 'top') { setDropTargetId(null); return; }
    e.dataTransfer.dropEffect = 'move';
    setDropTargetId(targetId);
  };

  const handleDrop = (e, targetId, targetType, targetParentId) => {
    e.preventDefault();
    const drag = dragRef.current;
    if (!drag || drag.id === targetId) { handleDragEnd(e); return; }

    updateDraft((d) => {
      const items = [...d.line_items];

      if (drag.type === 'top' && targetType === 'top') {
        // Group items into blocks: each top-level + its sub-components
        const blocks = [];
        const used = new Set();
        for (let i = 0; i < items.length; i++) {
          if (used.has(items[i].id)) continue;
          if (!items[i].parent_line_id) {
            const block = [items[i]];
            used.add(items[i].id);
            if (items[i].is_package) {
              for (let j = i + 1; j < items.length; j++) {
                if (items[j].parent_line_id === items[i].id) {
                  block.push(items[j]);
                  used.add(items[j].id);
                }
              }
            }
            blocks.push({ id: items[i].id, lines: block });
          }
        }
        const dragIdx = blocks.findIndex((b) => b.id === drag.id);
        const targetIdx = blocks.findIndex((b) => b.id === targetId);
        if (dragIdx === -1 || targetIdx === -1) return d;
        const [moved] = blocks.splice(dragIdx, 1);
        blocks.splice(targetIdx, 0, moved);
        d.line_items = blocks.flatMap((b) => b.lines);
      } else if (drag.type === 'sub' && targetType === 'sub' && drag.parentId === targetParentId) {
        // Reorder sub-components within a package
        const subIndices = [];
        items.forEach((l, i) => { if (l.parent_line_id === drag.parentId) subIndices.push(i); });
        const subs = subIndices.map((i) => items[i]);
        const dragSubIdx = subs.findIndex((s) => s.id === drag.id);
        const targetSubIdx = subs.findIndex((s) => s.id === targetId);
        if (dragSubIdx === -1 || targetSubIdx === -1) return d;
        const [moved] = subs.splice(dragSubIdx, 1);
        subs.splice(targetSubIdx, 0, moved);
        subIndices.forEach((idx, i) => { items[idx] = subs[i]; });
        d.line_items = items;
      }
      return d;
    });

    handleDragEnd(e);
  };

  // ── Status changes (view mode) ──
  const changeStatus = (newStatus) => {
    persistQuote((prev) => ({
      ...prev,
      status: newStatus,
      activity_log: [...(prev.activity_log || []), {
        type: 'status_change',
        from_status: prev.status,
        to_status: newStatus,
        timestamp: new Date().toISOString(),
        actor: prev.prepared_by || '',
      }],
    }));
  };

  // ── Derived data ──
  const liveData = mode === 'edit' && draft
    ? { line_items: draft.line_items, groups: draft.groups, header_discount: draft.header_discount, term_months: q.term_months }
    : q;
  const totals = calcQuoteTotals(liveData);
  const meta = STATUS_META[q.status] || STATUS_META.draft;

  // Detect summary value changes and trigger pulse animation
  const totalsFingerprint = `${totals.monthly}|${totals.annual}|${totals.tcv}`;
  useEffect(() => {
    if (prevTotalsRef.current !== null && prevTotalsRef.current !== totalsFingerprint) {
      setPulseKey((k) => k + 1);
    }
    prevTotalsRef.current = totalsFingerprint;
  }, [totalsFingerprint]);

  // Status eyebrow colors
  const STATUS_EYEBROW_COLORS = {
    draft: '#6b7280', sent: '#2E51ED', draft_revision: '#FBB13D',
    ready_to_submit: '#00AD9F', pending_approval: '#7C3AED',
    approved: '#16A34A', rejected: '#ef4444', converted: '#15803d',
    archived: '#9ca3af',
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const validateForSubmission = () => {
    const errors = [];
    if (!q.line_items || q.line_items.length === 0) errors.push('Quote must have at least 1 line item');
    if (!q.customer_name?.trim()) errors.push('Customer name is required');
    if (!q.start_date) errors.push('Start date is required');
    if (!q.end_date) errors.push('End date is required');
    return errors;
  };

  // ── Package helpers ──
  const togglePackage = (lineId) => {
    setCollapsedPkgs((prev) => {
      const next = new Set(prev);
      next.has(lineId) ? next.delete(lineId) : next.add(lineId);
      return next;
    });
  };

  const getSubLines = (items, parentId) => items.filter((l) => l.parent_line_id === parentId);
  const calcPkgExtended = (items, parentId) => getSubLines(items, parentId).reduce((s, l) => s + calcLineExtended(l), 0);

  // ── Editable cell renderer (edit mode) ──
  const renderEditableCell = (line, field, opts = {}) => {
    const { type = 'number', step = '1', min, max, disabled = false } = opts;
    const cellKey = `${line.id}-${field}`;
    const isEditing = editingCell === cellKey;

    if (disabled) {
      const dval = typeof line[field] === 'number' ? line[field] : 0;
      return <span className="cell-locked">{field === 'quantity' ? fmtQty(dval) : dval}</span>;
    }

    if (isEditing) {
      return (
        <input
          className="inline-edit"
          type={type}
          defaultValue={line[field] ?? 0}
          autoFocus
          step={step}
          min={min}
          max={max}
          onBlur={(e) => {
            const v = parseFloat(e.target.value) || 0;
            if (field === 'discount_percent' || field === 'discount_amount') {
              updateDraftDiscount(line.id, field, v);
            } else if (field === 'quantity') {
              updateDraftLineField(line.id, 'quantity', Math.max(1, Math.round(v)));
            } else {
              updateDraftLineField(line.id, field, v);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.target.blur();
            if (e.key === 'Escape') setEditingCell(null);
          }}
        />
      );
    }

    const val = line[field] ?? 0;
    let display;
    if (field === 'discount_percent') display = val > 0 ? `${val}%` : '—';
    else if (field === 'discount_amount' || field === 'list_price' || field === 'net_price') display = displayCurrency(val);
    else if (field === 'quantity') display = fmtQty(val);
    else display = val;

    return (
      <span className="cell-editable" onClick={() => setEditingCell(cellKey)}>
        {display}
      </span>
    );
  };

  // ════════════════════════════════════════
  //  DETAIL CARDS (view mode)
  // ════════════════════════════════════════
  const cardHeaderStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', cursor: 'pointer', userSelect: 'none' };
  const eyebrowStyle = { fontFamily: "'Roboto Mono', monospace", fontSize: '11px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9ca3af' };
  const cardBodyStyle = { padding: '4px 24px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 32px' };
  const chevronStyle = { fontSize: '12px', color: '#9ca3af' };
  const sectionDivider = { height: '1px', background: 'rgba(0,0,0,0.06)', margin: 0 };

  const toggleCard = (key) => setDetailCards((p) => ({ ...p, [key]: !p[key] }));

  const handleFieldChange = (field, value) => setQ((p) => ({ ...p, [field]: value }));
  const handleFieldBlur = (field, value) => persistQuote((prev) => ({ ...prev, [field]: value }));

  const renderDetailCards = (source) => (
    <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: '12px', padding: 0, marginBottom: '12px' }}>
      {/* Customer Information */}
      <div>
        <div style={cardHeaderStyle} onClick={() => toggleCard('customer')}>
          <span style={eyebrowStyle}>Customer Information</span>
          <span style={chevronStyle}>{detailCards.customer ? '▾' : '▸'}</span>
        </div>
        {detailCards.customer && (
          <div style={cardBodyStyle}>
            <DetailInput label="Customer Name" field="customer_name" value={source.customer_name} placeholder="Company name" span2 onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Primary Contact Name" field="contact_name" value={source.contact_name} placeholder="Full name" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Primary Contact Email" field="contact_email" value={source.contact_email} placeholder="contact@company.com" type="email" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Address" field="address" value={source.address} placeholder="Street, City, State, ZIP, Country" span2 textarea onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Billing Contact Name" field="billing_contact_name" value={source.billing_contact_name} placeholder="Full name" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Billing Contact Email" field="billing_contact_email" value={source.billing_contact_email} placeholder="billing@company.com" type="email" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Invoice Email" field="invoice_email" value={source.invoice_email} placeholder="invoices@company.com" type="email" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Netlify Account ID" field="account_id" value={source.account_id} placeholder="e.g. acct_abc123" mono onChange={handleFieldChange} onBlur={handleFieldBlur} />
          </div>
        )}
      </div>

      <div style={sectionDivider} />

      {/* Subscription Term */}
      <div>
        <div style={cardHeaderStyle} onClick={() => toggleCard('term')}>
          <span style={eyebrowStyle}>Subscription Term</span>
          <span style={chevronStyle}>{detailCards.term ? '▾' : '▸'}</span>
        </div>
        {detailCards.term && (
          <div style={cardBodyStyle}>
            <DetailInput label="Subscription Start Date" field="start_date" value={source.start_date} type="date" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Subscription Term (Months)" field="term_months" value={source.term_months} placeholder="12" onChange={handleFieldChange} onBlur={handleFieldBlur} />
          </div>
        )}
      </div>

      <div style={sectionDivider} />

      {/* Billing & Payment */}
      <div>
        <div style={cardHeaderStyle} onClick={() => toggleCard('billing')}>
          <span style={eyebrowStyle}>Billing & Payment</span>
          <span style={chevronStyle}>{detailCards.billing ? '▾' : '▸'}</span>
        </div>
        {detailCards.billing && (
          <div style={cardBodyStyle}>
            <DetailInput label="Billing Schedule" field="billing_schedule" value={source.billing_schedule} options={['Annual', 'Semi-Annual', 'Quarterly', 'Monthly']} onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Payment Method" field="payment_method" value={source.payment_method} options={['Credit Card', 'ACH / Bank Transfer', 'Wire Transfer', 'Check', 'Invoice']} onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Payment Terms" field="payment_terms" value={source.payment_terms} options={['Net 30', 'Net 45', 'Net 60', 'Due on Receipt']} onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="PO #" field="po_number" value={source.po_number} placeholder="Optional" mono onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="VAT #" field="vat_number" value={source.vat_number} placeholder="Optional" mono onChange={handleFieldChange} onBlur={handleFieldBlur} />
          </div>
        )}
      </div>

    </div>
  );

  // ════════════════════════════════════════
  //  VIEW MODE
  // ════════════════════════════════════════

  // ── View mode table rows ──
  const renderViewRow = (line) => {
    if (line.is_package) {
      const subs = getSubLines(q.line_items, line.id);
      const expanded = !collapsedPkgs.has(line.id);
      const pkgTotal = calcPkgExtended(q.line_items, line.id);
      return (
        <React.Fragment key={line.id}>
          <tr className="line-row-package">
            <td className="line-td-product" style={{ width: '23%', minWidth: '200px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="cell-name" style={{ margin: 0 }}>{line.product_name}</span>
                <span className="pkg-badge">PKG</span>
                <button className="pkg-chevron" onClick={() => togglePackage(line.id)} style={{ marginLeft: 0 }}>
                  {expanded ? '▾' : '▸'}
                </button>
              </div>
            </td>
            <td style={{ width: '10%' }} />
            <td style={{ width: '10%' }} />
            <td style={{ width: '10%' }} />
            <td style={{ width: '10%' }} />
            <td style={{ width: '10%' }} />
            <td style={{ width: '10%' }}><span className="price-monthly">{displayCurrency(pkgTotal)}</span></td>
          </tr>
          {expanded && subs.map((sub) => {
            const ext = calcLineExtended(sub);
            return (
              <tr key={sub.id} className="line-row-sub">
                <td className="line-td-product qd-view-sub-product pkg-sub-product" style={{ width: '23%', minWidth: '200px' }}>
                  <div className="cell-name">{sub.product_name}</div>
                </td>
                <td style={{ width: '10%' }}><span className="cell-sku">{getUnitLabel(sub.unit_type || 'flat')}</span></td>
                <td style={{ width: '12%' }}>{fmtQty(sub.quantity)}</td>
                <td style={{ width: '10%' }}>{displayCurrency(sub.list_price ?? 0)}</td>
                <td style={{ width: '10%' }}>{(sub.discount_percent ?? 0) > 0 ? `${sub.discount_percent}%` : '—'}</td>
                <td style={{ width: '10%' }}>{displayCurrency(sub.net_price ?? sub.list_price ?? 0)}</td>
                <td style={{ width: '10%' }}><span className="price-monthly">{displayCurrency(ext)}</span></td>
              </tr>
            );
          })}
        </React.Fragment>
      );
    }

    const unitType = line.unit_type || 'flat';
    const extended = calcLineExtended(line);
    return (
      <tr key={line.id}>
        <td className="line-td-product" style={{ width: '23%', minWidth: '200px' }}>
          <div className="cell-name">{line.product_name}</div>
        </td>
        <td style={{ width: '10%' }}><span className="cell-sku">{getUnitLabel(unitType)}</span></td>
        <td style={{ width: '12%' }}>{fmtQty(line.quantity)}</td>
        <td style={{ width: '10%' }}>{isIncluded(unitType) ? '—' : displayCurrency(line.list_price ?? 0)}</td>
        <td style={{ width: '10%' }}>{isIncluded(unitType) ? '—' : ((line.discount_percent ?? 0) > 0 ? `${line.discount_percent}%` : '—')}</td>
        <td style={{ width: '10%' }}>{isIncluded(unitType) ? '—' : displayCurrency(line.net_price ?? line.list_price ?? 0)}</td>
        <td style={{ width: '10%' }}><span className="price-monthly">{isIncluded(unitType) ? '—' : displayCurrency(extended)}</span></td>
      </tr>
    );
  };

  // ════════════════════════════════════════
  //  EDIT MODE TABLE (inline)
  // ════════════════════════════════════════
  const renderEditTable = () => {
    if (!draft) return null;
    const items = draft.line_items;
    const groups = draft.groups;
    const hd = draft.header_discount;
    const topLevel = items.filter((l) => !l.group_id && !l.parent_line_id);
    const groupedItems = (gid) => items.filter((l) => l.group_id === gid && !l.parent_line_id);
    const groupSubtotal = (gid) => groupedItems(gid)
      .reduce((s, l) => {
        if (l.is_package) return s + calcPkgExtended(items, l.id);
        return s + calcLineExtended(l);
      }, 0);

    const editTableHead = (
      <thead>
        <tr>
          <th style={{ width: '23%', minWidth: '200px' }}>Product</th>
          <th style={{ width: '10%' }}>Unit</th>
          <th style={{ width: '12%' }}>Qty</th>
          <th style={{ width: '10%' }}>List Price</th>
          <th style={{ width: '10%' }}>Disc %</th>
          <th style={{ width: '10%' }}>Net Price</th>
          <th style={{ width: '10%' }}>Amount</th>
          <th style={{ width: '60px' }} />
        </tr>
      </thead>
    );

    const renderEditStandalone = (line) => {
      const unitType = line.unit_type || 'flat';
      const included = isIncluded(unitType);
      const extended = calcLineExtended(line);
      return (
        <tr
          key={line.id}
          className={dropTargetId === line.id ? 'drag-over' : ''}
          draggable
          onDragStart={(e) => handleDragStart(e, line.id, 'top')}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, line.id, 'top')}
          onDrop={(e) => handleDrop(e, line.id, 'top')}
        >
          <td className="line-td-product" style={{ width: '23%', minWidth: '200px' }}>
            {line.name_editable ? (
              <input
                className="inline-edit"
                type="text"
                value={line.product_name}
                onChange={(e) => updateDraftLineField(line.id, 'product_name', e.target.value)}
                style={{ width: '100%', fontWeight: 500 }}
              />
            ) : (
              <div className="cell-name">{line.product_name}</div>
            )}
          </td>
          <td style={{ width: '10%' }}><span className="cell-sku">{getUnitLabel(unitType)}</span></td>
          <td style={{ width: '12%' }}>{included ? <span className="cell-locked">1</span> : renderEditableCell(line, 'quantity', { step: '1', min: '1' })}</td>
          <td style={{ width: '10%' }}>{included ? <span className="price-annual">—</span> : renderEditableCell(line, 'list_price', { step: '0.01', min: '0' })}</td>
          <td style={{ width: '10%' }}>{included ? <span className="price-annual">—</span> : renderEditableCell(line, 'discount_percent', { step: '0.1', min: '0', max: '100' })}</td>
          <td style={{ width: '10%' }}>{included ? <span className="price-annual">—</span> : <span className="price-monthly">{displayCurrency(line.net_price ?? line.list_price ?? 0)}</span>}</td>
          <td style={{ width: '10%' }}>{included ? <span className="price-annual">—</span> : <span className="price-monthly">{displayCurrency(extended)}</span>}</td>
          <td style={{ width: '60px' }}>
            <div className="actions-group">
              <span className="drag-handle edit-drag-handle" style={{ cursor: 'grab', color: '#9ca3af', fontSize: '12px' }}>⋮⋮</span>
              <button className="action-btn delete line-remove-btn" title="Remove" onClick={() => removeDraftLine(line.id)}>Remove</button>
            </div>
          </td>
        </tr>
      );
    };

    const renderEditPackage = (line) => {
      const expanded = !collapsedPkgs.has(line.id);
      const subs = getSubLines(items, line.id);
      const pkgTotal = calcPkgExtended(items, line.id);
      return (
        <React.Fragment key={line.id}>
          <tr
            className={`line-row-package${dropTargetId === line.id ? ' drag-over' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, line.id, 'top')}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, line.id, 'top')}
            onDrop={(e) => handleDrop(e, line.id, 'top')}
          >
            <td className="line-td-product" style={{ width: '23%', minWidth: '200px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {line.name_editable ? (
                  <input
                    className="inline-edit"
                    type="text"
                    value={line.product_name}
                    onChange={(e) => updateDraftLineField(line.id, 'product_name', e.target.value)}
                    style={{ flex: 1, fontWeight: 500 }}
                  />
                ) : (
                  <span className="cell-name" style={{ margin: 0 }}>{line.product_name}</span>
                )}
                <span className="pkg-badge">PKG</span>
                <button className="pkg-chevron" onClick={() => togglePackage(line.id)} style={{ marginLeft: 0 }}>
                  {expanded ? '▾' : '▸'}
                </button>
              </div>
            </td>
            <td style={{ width: '10%' }} /><td style={{ width: '10%' }} /><td style={{ width: '10%' }} /><td style={{ width: '10%' }} /><td style={{ width: '10%' }} />
            <td style={{ width: '10%' }}><span className="price-monthly">{displayCurrency(pkgTotal)}</span></td>
            <td style={{ width: '60px' }}>
              <div className="actions-group">
                <span className="drag-handle edit-drag-handle" style={{ cursor: 'grab', color: '#9ca3af', fontSize: '12px' }}>⋮⋮</span>
                <button className="action-btn delete line-remove-btn" title="Remove package" onClick={() => removeDraftLine(line.id)}>Remove</button>
              </div>
            </td>
          </tr>
          {expanded && subs.map((sub) => {
            const unitType = sub.unit_type || 'flat';
            const ext = calcLineExtended(sub);
            return (
              <tr key={sub.id} className={`line-row-sub${dropTargetId === sub.id ? ' drag-over' : ''}`} draggable
                onDragStart={(e) => handleDragStart(e, sub.id, 'sub', line.id)} onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, sub.id, 'sub', line.id)} onDrop={(e) => handleDrop(e, sub.id, 'sub', line.id)}
              >
                <td className="line-td-product pkg-sub-product" style={{ width: '23%', minWidth: '200px' }}>
                  {sub.name_editable ? (
                    <input
                      className="inline-edit"
                      type="text"
                      value={sub.product_name}
                      onChange={(e) => updateDraftLineField(sub.id, 'product_name', e.target.value)}
                      style={{ width: '100%', fontWeight: 500 }}
                    />
                  ) : (
                    <div className="cell-name">{sub.product_name}</div>
                  )}
                </td>
                <td style={{ width: '10%' }}><span className="cell-sku">{getUnitLabel(unitType)}</span></td>
                <td style={{ width: '12%' }}>{renderEditableCell(sub, 'quantity', { step: '1', min: '1' })}</td>
                <td style={{ width: '10%' }}>{renderEditableCell(sub, 'list_price', { step: '0.01', min: '0' })}</td>
                <td style={{ width: '10%' }}>{renderEditableCell(sub, 'discount_percent', { step: '0.1', min: '0', max: '100' })}</td>
                <td style={{ width: '10%' }}><span className="price-monthly">{displayCurrency(sub.net_price ?? sub.list_price ?? 0)}</span></td>
                <td style={{ width: '10%' }}><span className="price-monthly">{displayCurrency(ext)}</span></td>
                <td style={{ width: '60px' }}>
                  <div className="actions-group">
                    <span className="drag-handle edit-drag-handle" style={{ cursor: 'grab', color: '#9ca3af', fontSize: '12px' }}>⋮⋮</span>
                    <button className="action-btn delete line-remove-btn" title="Remove" onClick={() => removeDraftLine(sub.id)}>Remove</button>
                  </div>
                </td>
              </tr>
            );
          })}
          {expanded && (
            <tr className="line-row-sub">
              <td colSpan={8} style={{ paddingLeft: 36 }}>
                <button type="button" className="pkg-add-component-link" onClick={() => setAddingToPackageId(addingToPackageId === line.id ? null : line.id)}>
                  Add Component
                </button>
              </td>
            </tr>
          )}
        </React.Fragment>
      );
    };

    const renderEditRow = (line) => {
      if (line.parent_line_id) return null;
      if (line.is_package) return renderEditPackage(line);
      return renderEditStandalone(line);
    };

    const editCategoryGroups = groupLinesByCategory(items);

    return (
      <>
        <div className="qd-lines-card">
          {items.length === 0 ? (
            <div className="edit-empty-state">
              <div className="nomi-scene">
                <div className="nomi-clip">
                  <img
                    src="/Nomi.svg"
                    alt="Nomi"
                    className="nomi-character"
                    onAnimationEnd={(e) => { e.target.classList.add('nomi-resting'); }}
                  />
                </div>
              </div>
              <div className="edit-empty-title">Start building your quote</div>
              <button className="edit-empty-cta" onClick={() => setShowPicker(true)}>
                Browse Products
              </button>
            </div>
          ) : (
            <div className="qd-grouped-cards">
              {editCategoryGroups.map((group) => (
                <div key={group.category} className="qd-category-card">
                  <div className="qd-category-card-header">
                    <span className="qd-category-card-title">{group.label}</span>
                    <span className="qd-category-badge" style={group.badge}>{group.category === 'bundle' ? 'PKG' : group.label}</span>
                  </div>
                  {group.category === 'bundle' ? (
                    <table className="data-table line-table">
                      {editTableHead}
                      <tbody>{group.lines.map((line) => renderEditPackage(line))}</tbody>
                    </table>
                  ) : (
                    <table className="data-table line-table">
                      {editTableHead}
                      <tbody>{group.lines.map(renderEditStandalone)}</tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="qd-line-footer-actions">
            <button className="btn-primary" onClick={() => setShowPicker(true)}>Add Product</button>
          </div>
        </div>

        {/* Edit mode modals */}
        {showPicker && (
          <ProductPicker products={availableProducts} onAdd={addLineToDraft} onClose={() => setShowPicker(false)} multiSelect existingProductIds={new Set()} />
        )}
        {addingToPackageId && (
          <ProductPicker products={availableProducts.filter((p) => !isBundleProduct(p))} onAdd={(product) => addSubComponentToDraft(product, addingToPackageId)} onClose={() => setAddingToPackageId(null)} />
        )}
        {showGroupModal && (
          <div className="modal-overlay" onClick={() => { setShowGroupModal(false); setGroupName(''); }}>
            <div className="modal modal-theme-quotes" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">New Group</div>
              <div className="field">
                <label className="field-label">Group Name</label>
                <input className="field-input" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Platform Services" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') addDraftGroup(); }} />
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => { setShowGroupModal(false); setGroupName(''); }}>Cancel</button>
                <button className="btn-save" onClick={addDraftGroup} disabled={!groupName.trim()}>Create Group</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  // ── Shared sub-renders ──
  const renderSummary = (t, source) => (
    <div className="qd-summary">
      <div className="qd-summary-item">
        <div className="qd-summary-label">MRR</div>
        {t.hasQuoteDiscount && <div className="qd-summary-pre">{fmtCurrency(t.preDiscountMonthly)}</div>}
        <AnimatedValue value={fmtCurrency(t.monthly)} pulseKey={pulseKey} />
      </div>
      <div style={{ width: '1px', backgroundColor: '#FBB13D', alignSelf: 'stretch', margin: '0', padding: '0', border: 'none', flexShrink: 0 }} />
      <div className="qd-summary-item">
        <div className="qd-summary-label">ARR</div>
        {t.hasQuoteDiscount && <div className="qd-summary-pre">{fmtCurrency(t.preDiscountAnnual)}</div>}
        <AnimatedValue value={fmtCurrency(t.annual)} pulseKey={pulseKey} />
      </div>
      <div style={{ width: '1px', backgroundColor: '#FBB13D', alignSelf: 'stretch', margin: '0', padding: '0', border: 'none', flexShrink: 0 }} />
      <div className="qd-summary-item qd-summary-tcv">
        <div className="qd-summary-label">TCV ({source.term_months} month)</div>
        {t.hasQuoteDiscount && <div className="qd-summary-pre">{fmtCurrency(t.preDiscountTcv)}</div>}
        <AnimatedValue value={fmtCurrency(t.tcv)} pulseKey={pulseKey} />
      </div>
      {t.hasQuoteDiscount && (
        <>
          <div style={{ width: '1px', backgroundColor: '#FBB13D', alignSelf: 'stretch', margin: '0', padding: '0', border: 'none', flexShrink: 0 }} />
          <div className="qd-summary-item">
            <div className="qd-summary-label">Quote Discount</div>
            <div className="qd-summary-value">{source.header_discount}%</div>
          </div>
        </>
      )}
    </div>
  );

  const renderFooterInfo = (source) => {
    if (!source.comments && !source.terms_conditions && !source.prepared_by) return null;
    return (
      <div className="qd-footer-info">
        {source.prepared_by && (
          <div className="qd-footer-row">
            <span className="qd-footer-label">Prepared by</span>
            <span className="qd-footer-value">{source.prepared_by}</span>
          </div>
        )}
        {source.comments && (
          <div className="qd-footer-row">
            <span className="qd-footer-label">Comments</span>
            <span className="qd-footer-value">{source.comments}</span>
          </div>
        )}
        {source.terms_conditions && (
          <div className="qd-footer-row">
            <span className="qd-footer-label">Terms & Conditions</span>
            <span className="qd-footer-value">{source.terms_conditions}</span>
          </div>
        )}
      </div>
    );
  };

  const renderConfirmModal = () => (
    <div className="modal-overlay" onClick={() => setConfirm(null)}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">Confirm</div>
        <div className="confirm-message">{confirm.msg}</div>
        <div className="confirm-actions">
          <button className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn-save" onClick={confirm.fn}>{confirm.label || 'Confirm'}</button>
        </div>
      </div>
    </div>
  );

  const isEditing = mode === 'edit';
  const isArchived = q.status === 'archived';
  const canEditLines = ['draft', 'draft_revision'].includes(q.status);
  const viewItems = q.line_items.filter((l) => !l.parent_line_id);

  // Group line items by category for card display
  const groupLinesByCategory = (items) => {
    const hasPackage = items.some((l) => l.is_package);
    const order = hasPackage ? CARD_ORDER_WITH_PACKAGE : CARD_ORDER_NO_PACKAGE;
    const topLevel = items.filter((l) => !l.parent_line_id);
    const groups = {};
    topLevel.forEach((line) => {
      const cat = line.is_package ? 'bundle' : (line.product_type || 'platform');
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(line);
    });
    return order.filter((cat) => groups[cat] && groups[cat].length > 0).map((cat) => ({
      category: cat,
      label: getCategoryCardLabel(cat, hasPackage),
      badge: CATEGORY_BADGE_STYLES[cat] || CATEGORY_BADGE_STYLES.platform,
      lines: groups[cat],
    }));
  };

  return (
    <div className="quote-detail">
      {/* Header */}
      <div className="qd-header">
        <button className="back-btn" onClick={onBack}>
          Back to Quotes
        </button>
        <div className="qd-header-info" style={{ flex: 1 }}>
          <div className="qd-quote-number">{q.quote_number}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '24px' }}>
            {editingTitle ? (
              <input
                autoFocus
                type="text"
                value={q.name}
                placeholder="Quote name"
                onChange={(e) => setQ((prev) => ({ ...prev, name: e.target.value }))}
                onBlur={(e) => {
                  setEditingTitle(false);
                  persistQuote((prev) => ({ ...prev, name: e.target.value }));
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingTitle(false); }}
                style={{
                  fontFamily: "'Poppins', sans-serif", fontSize: '34px', fontWeight: 300, letterSpacing: '-0.01em',
                  color: 'var(--text-strong)', background: 'transparent', border: 'none', borderBottom: '1px solid #FBB13D',
                  outline: 'none', padding: 0, margin: 0, flex: 1, lineHeight: 'inherit',
                }}
              />
            ) : (
              <h1 className="qd-title" onClick={() => setEditingTitle(true)} style={{ cursor: 'pointer', flex: 1 }}>
                {q.name || 'Untitled Quote'}
              </h1>
            )}
            {!isEditing && (
              <div style={{
                fontFamily: "'Roboto Mono', monospace",
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: STATUS_EYEBROW_COLORS[q.status] || '#6b7280',
                whiteSpace: 'nowrap',
                paddingRight: '8px',
              }}>
                {(STATUS_META[q.status] || STATUS_META.draft).label}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Archived banner */}
      {q.status === 'archived' && (
        <div className="qd-archived-banner">
          This quote is archived
        </div>
      )}

      {/* Validation errors */}
      {validationErrors && (
        <div className="qd-validation-errors">
          <div className="qd-validation-errors-title">Cannot submit — missing required fields:</div>
          <ul>
            {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {/* Action bar */}
      <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', margin: '0 0 24px', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
        {isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="qd-action-btn" onClick={cancelEdit}>Cancel</button>
            <button className="qd-action-btn qd-action-btn-primary" onClick={saveEdit}>Save</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

            {/* ── DRAFT actions ── */}
            {q.status === 'draft' && (
              <>
                <button className="qd-action-btn" onClick={enterEditMode}>
                  {q.line_items.length === 0 ? 'Add Lines' : 'Edit Lines'}
                </button>
                <button className="qd-action-btn" onClick={() => generateQuotePdf(q)}>
                  Preview PDF
                </button>
                <button className="qd-action-btn qd-action-btn-primary" onClick={() => changeStatus('sent')}>
                  Send to Customer
                </button>
              </>
            )}

            {/* ── SENT actions ── */}
            {q.status === 'sent' && (
              <>
                <button className="qd-action-btn" onClick={() => { setFeedbackText(q.comments || ''); setFeedbackModal(true); }}>
                  Record Feedback
                </button>
                <button className="qd-action-btn" onClick={() => {
                  const cloned = onClone(q);
                  if (cloned) {
                    persistQuote(() => ({ ...cloned, name: (q.name || 'Quote') + ' — Scenario', status: 'draft' }));
                  }
                }}>
                  Clone as Scenario
                </button>
                <button className="qd-action-btn" onClick={() => changeStatus('draft')}>
                  Revise Quote
                </button>
              </>
            )}

            {/* ── DRAFT REVISION actions ── */}
            {q.status === 'draft_revision' && (
              <>
                <button className="qd-action-btn" onClick={enterEditMode}>
                  {q.line_items.length === 0 ? 'Add Lines' : 'Edit Lines'}
                </button>
                <button className="qd-action-btn" onClick={() => generateQuotePdf(q)}>
                  Preview PDF
                </button>
                <button className="qd-action-btn" onClick={() => {
                  persistQuote((prev) => ({ ...prev, is_primary: true }));
                  showToast('Marked as primary quote');
                }}>
                  Mark as Primary
                </button>
                <button className="qd-action-btn qd-action-btn-primary" onClick={() => changeStatus('sent')}>
                  Send to Customer
                </button>
              </>
            )}

            {/* ── READY TO SUBMIT actions ── */}
            {q.status === 'ready_to_submit' && (
              <>
                <button className="qd-action-btn qd-action-btn-teal" onClick={() => {
                  const errors = validateForSubmission();
                  if (errors.length > 0) {
                    setValidationErrors(errors);
                    return;
                  }
                  setValidationErrors(null);
                  changeStatus('pending_approval');
                }}>
                  Submit to Deal Desk
                </button>
              </>
            )}

            {/* ── PENDING APPROVAL actions ── */}
            {q.status === 'pending_approval' && (
              <>
                <button className="qd-action-btn" onClick={() => showToast('Submission details coming soon')}>
                  View Submission
                </button>
                <button className="qd-action-btn" onClick={() => setConfirm({
                  msg: 'Are you sure? This will pull the quote back to Draft.',
                  label: 'Withdraw',
                  fn: () => { changeStatus('draft'); setConfirm(null); },
                })}>
                  Withdraw Submission
                </button>
              </>
            )}

            {/* ── APPROVED actions ── */}
            {q.status === 'approved' && (
              <>
                <button className="qd-action-btn qd-action-btn-primary" onClick={() => changeStatus('converted')}>
                  Convert to Order
                </button>
                <button className="qd-action-btn" onClick={() => showToast('PDF generation coming soon')}>
                  Download Final PDF
                </button>
              </>
            )}

            {/* ── REJECTED actions ── */}
            {q.status === 'rejected' && (
              <>
                <button className="qd-action-btn" onClick={() => setDdNotesModal(true)}>
                  View DD Notes
                </button>
                <button className="qd-action-btn qd-action-btn-primary" onClick={() => changeStatus('draft')}>
                  Revise Quote
                </button>
              </>
            )}

            {/* ── CONVERTED actions ── */}
            {q.status === 'converted' && (
              <>
                <button className="qd-action-btn" onClick={() => showToast('Order view coming soon')}>
                  View Order
                </button>
                <button className="qd-action-btn" onClick={() => showToast('PDF generation coming soon')}>
                  Download Executed Quote PDF
                </button>
              </>
            )}

            {/* ── ARCHIVED actions ── */}
            {q.status === 'archived' && (
              <>
                <button className="qd-action-btn" onClick={() => setConfirm({
                  msg: 'Restore this quote as a Draft? It will become editable again.',
                  label: 'Restore',
                  fn: () => { changeStatus('draft'); setConfirm(null); },
                })}>
                  Restore as Draft
                </button>
              </>
            )}

            {/* Overflow menu (...) */}
            {['draft', 'sent', 'draft_revision', 'ready_to_submit', 'rejected'].includes(q.status) && (
              <div className="qd-more-wrap" ref={moreRef}>
                <button className="qd-more-btn" style={{ border: 'none', background: 'transparent', boxShadow: 'none', outline: 'none', color: '#FBB13D', cursor: 'pointer', padding: '0 8px' }} onClick={() => setShowMoreMenu(!showMoreMenu)}>
                  ···
                </button>
                {showMoreMenu && (
                  <div className="qd-more-menu">
                    {q.status === 'draft' && (
                      <>
                        <button className="qd-more-item" onClick={() => { setShowMoreMenu(false); onClone(q); }}>
                          Clone Quote
                        </button>
                        <button className="qd-more-item" onClick={() => { setShowMoreMenu(false); setConfirm({ msg: 'Archive this quote? It will become read-only.', label: 'Archive', fn: () => { changeStatus('archived'); setConfirm(null); } }); }}>
                          Archive
                        </button>
                      </>
                    )}
                    {q.status === 'sent' && (
                      <button className="qd-more-item" onClick={() => { setShowMoreMenu(false); setConfirm({ msg: 'Archive this quote? It will become read-only.', label: 'Archive', fn: () => { changeStatus('archived'); setConfirm(null); } }); }}>
                        Archive
                      </button>
                    )}
                    {q.status === 'draft_revision' && (
                      <button className="qd-more-item" onClick={() => { setShowMoreMenu(false); setConfirm({ msg: 'Archive this scenario? It will become read-only.', label: 'Archive', fn: () => { changeStatus('archived'); setConfirm(null); } }); }}>
                        Archive Scenario
                      </button>
                    )}
                    {q.status === 'ready_to_submit' && (
                      <button className="qd-more-item" onClick={() => { setShowMoreMenu(false); changeStatus('draft'); }}>
                        Revise Quote
                      </button>
                    )}
                    {q.status === 'rejected' && (
                      <button className="qd-more-item" onClick={() => { setShowMoreMenu(false); setConfirm({ msg: 'Archive this quote? It will become read-only.', label: 'Archive', fn: () => { changeStatus('archived'); setConfirm(null); } }); }}>
                        Archive
                      </button>
                    )}
                    <button className="qd-more-item qd-more-danger" onClick={() => { setShowMoreMenu(false); onDelete(q.id); }}>
                      Delete Quote
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Detail Cards */}
      {renderDetailCards(q)}

      {/* Line Items */}
      <div className="qd-lines-section">
        <div className="line-editor-header">
          <div className="line-editor-title">Line Items</div>
        </div>

        {isEditing ? (
          renderEditTable()
        ) : (
          <>
            {q.line_items.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-numeral">0</div>
                <div className="empty-state-eyebrow">Line Items</div>
                <div className="empty-state-title">No line items</div>
                <div className="empty-state-text">Click "Edit Lines" to add products to this quote</div>
              </div>
            ) : (
              <div className="qd-grouped-cards">
                {groupLinesByCategory(q.line_items).map((group) => (
                  <div key={group.category} className="qd-category-card">
                    <div className="qd-category-card-header">
                      <span className="qd-category-card-title">{group.label}</span>
                      <span className="qd-category-badge" style={group.badge}>{group.category === 'bundle' ? 'PKG' : group.label}</span>
                    </div>
                    {group.category === 'bundle' ? (
                      group.lines.map((line) => {
                        const subs = getSubLines(q.line_items, line.id);
                        const expanded = !collapsedPkgs.has(line.id);
                        const pkgTotal = calcPkgExtended(q.line_items, line.id);
                        return (
                          <div key={line.id} className="qd-pkg-block">
                            <div className="qd-pkg-header" onClick={() => togglePackage(line.id)}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '11px', color: '#9ca3af' }}>{expanded ? '▾' : '▸'}</span>
                                <span className="cell-name" style={{ margin: 0 }}>{line.product_name}</span>
                                <span className="pkg-badge">PKG</span>
                              </div>
                              <span className="price-monthly">{displayCurrency(pkgTotal)}</span>
                            </div>
                            {expanded && subs.length > 0 && (
                              <div className="qd-pkg-members">
                                {subs.map((sub) => (
                                  <div key={sub.id} className="qd-pkg-member-row">
                                    <span className="qd-pkg-member-name">{sub.product_name}</span>
                                    {sub.quantity > 1 && <span className="qd-pkg-member-qty">qty {sub.quantity}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <table className="data-table line-table">
                        <thead>
                          <tr>
                            <th style={{ width: '25%', minWidth: '200px' }}>Product</th>
                            <th style={{ width: '12%' }}>Qty</th>
                            <th style={{ width: '13%' }}>List Price</th>
                            <th style={{ width: '12%' }}>Disc %</th>
                            <th style={{ width: '13%' }}>Net Price</th>
                            <th style={{ width: '13%' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.lines.map((line) => {
                            const unitType = line.unit_type || 'flat';
                            const extended = calcLineExtended(line);
                            return (
                              <tr key={line.id}>
                                <td className="line-td-product" style={{ width: '25%', minWidth: '200px' }}>
                                  <div className="cell-name">{line.product_name}</div>
                                </td>
                                <td style={{ width: '12%' }}>{fmtQty(line.quantity)}</td>
                                <td style={{ width: '13%' }}>{isIncluded(unitType) ? '—' : displayCurrency(line.list_price ?? 0)}</td>
                                <td style={{ width: '12%' }}>{isIncluded(unitType) ? '—' : ((line.discount_percent ?? 0) > 0 ? `${line.discount_percent}%` : '—')}</td>
                                <td style={{ width: '13%' }}>{isIncluded(unitType) ? '—' : displayCurrency(line.net_price ?? line.list_price ?? 0)}</td>
                                <td style={{ width: '13%' }}><span className="price-monthly">{isIncluded(unitType) ? '—' : displayCurrency(extended)}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Overage Rates */}
      <div style={{ marginTop: '24px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: '12px', padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleCard('overage')}>
            <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: '11px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9ca3af' }}>Overage Rates</span>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>{detailCards.overage ? '▾' : '▸'}</span>
          </div>
          {detailCards.overage && (
            <div style={{ padding: '4px 24px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 32px' }}>
              <DetailInput label="Overage Rate per 1,500 Credits" field="overage_rate_credits" value={q.overage_rate_credits} placeholder="$0.00" onChange={handleFieldChange} onBlur={handleFieldBlur} />
              <DetailInput label="Overage Rate per User / Seat" field="overage_rate_seats" value={q.overage_rate_seats} placeholder="$0.00" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      {isEditing ? (
        <div className="qd-summary" style={{ marginTop: '16px' }}>
          <div className="qd-summary-item">
            <div className="qd-summary-label">Quote Discount %</div>
            <div className="qd-summary-value">
              <input className="inline-edit qd-discount-input" type="number" min="0" max="100" step="0.1" value={draft?.header_discount ?? 0}
                onChange={(e) => updateDraft((d) => ({ ...d, header_discount: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
          <div style={{ width: '1px', backgroundColor: '#FBB13D', alignSelf: 'stretch', margin: '0', padding: '0', border: 'none', flexShrink: 0 }} />
          <div className="qd-summary-item">
            <div className="qd-summary-label">MRR</div>
            <AnimatedValue value={fmtCurrency(totals.monthly)} pulseKey={pulseKey} />
          </div>
          <div style={{ width: '1px', backgroundColor: '#FBB13D', alignSelf: 'stretch', margin: '0', padding: '0', border: 'none', flexShrink: 0 }} />
          <div className="qd-summary-item">
            <div className="qd-summary-label">ARR</div>
            <AnimatedValue value={fmtCurrency(totals.annual)} pulseKey={pulseKey} />
          </div>
          <div style={{ width: '1px', backgroundColor: '#FBB13D', alignSelf: 'stretch', margin: '0', padding: '0', border: 'none', flexShrink: 0 }} />
          <div className="qd-summary-item qd-summary-tcv">
            <div className="qd-summary-label">TCV ({q.term_months} month)</div>
            <AnimatedValue value={fmtCurrency(totals.tcv)} pulseKey={pulseKey} />
          </div>
        </div>
      ) : (
        <div>
          {renderSummary(totals, q)}
        </div>
      )}

      {/* Footer info */}
      <div>
        {renderFooterInfo(q)}
      </div>

      {/* Activity Log */}
      <div style={{ marginTop: '28px' }}>
        <div className="qd-footer-label" style={{ marginBottom: '12px' }}>Activity</div>
        <div className="qd-activity-timeline">
          {[...(q.activity_log || [])].reverse().map((entry, i, arr) => {
            let dotColor = '#00AD9F';
            let text = '';
            if (entry.type === 'status_change') {
              dotColor = ACTIVITY_DOT_COLORS[entry.to_status] || '#6b7280';
              const fromLabel = (STATUS_META[entry.from_status] || {}).label || entry.from_status;
              const toLabel = (STATUS_META[entry.to_status] || {}).label || entry.to_status;
              text = `${entry.actor || 'System'} moved quote from ${fromLabel} → ${toLabel}`;
            } else if (entry.type === 'created') {
              dotColor = '#00AD9F';
              text = `Quote created${entry.actor ? ` by ${entry.actor}` : ''}`;
            } else if (entry.type === 'note') {
              dotColor = '#FBB13D';
              const noteText = entry.note || '';
              text = `Feedback recorded: ${noteText.length > 80 ? noteText.slice(0, 80) + '…' : noteText}`;
            }
            const isLast = i === arr.length - 1;
            return (
              <div key={i} className="qd-activity-entry">
                <div className="qd-activity-dot-col">
                  <div className="qd-activity-dot" style={{ background: dotColor }} />
                  {!isLast && <div className="qd-activity-line" />}
                </div>
                <div className="qd-activity-content">
                  <span className="qd-activity-text">{text}</span>
                  <span className="qd-activity-time">{relativeTime(entry.timestamp)}</span>
                </div>
              </div>
            );
          })}
          {(!q.activity_log || q.activity_log.length === 0) && (
            <div style={{ fontSize: '13px', color: '#9ca3af' }}>No activity recorded.</div>
          )}
        </div>
      </div>

      {/* Feedback modal */}
      {feedbackModal && (
        <div className="modal-overlay" onClick={() => setFeedbackModal(false)}>
          <div className="modal modal-theme-quotes" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Customer Feedback</div>
            <div className="modal-section">
              <div className="field">
                <label className="field-label">Revision Notes</label>
                <textarea
                  className="field-textarea"
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Enter customer feedback and revision notes..."
                  style={{ minHeight: 120 }}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setFeedbackModal(false)}>Cancel</button>
              <button className="btn-save" onClick={() => {
                const now = new Date().toISOString();
                persistQuote((prev) => ({
                  ...prev,
                  comments: feedbackText,
                  status: 'draft_revision',
                  activity_log: [...(prev.activity_log || []),
                    { type: 'note', timestamp: now, note: feedbackText, actor: prev.prepared_by || '' },
                    { type: 'status_change', from_status: prev.status, to_status: 'draft_revision', timestamp: now, actor: prev.prepared_by || '' },
                  ],
                }));
                setFeedbackModal(false);
              }}>Save Feedback</button>
            </div>
          </div>
        </div>
      )}

      {/* Deal Desk Notes modal (read-only) */}
      {ddNotesModal && (
        <div className="modal-overlay" onClick={() => setDdNotesModal(false)}>
          <div className="modal modal-theme-quotes" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Deal Desk Notes</div>
            <div className="modal-section">
              <div style={{ fontSize: '14px', color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap', minHeight: 60 }}>
                {q.comments || 'No notes recorded.'}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDdNotesModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="qd-toast">{toast}</div>}

      {/* Confirm modal */}
      {confirm && renderConfirmModal()}
    </div>
  );
}
