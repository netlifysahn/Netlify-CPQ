import React, { useState, useRef, useEffect, Component } from 'react';
import {
  calcQuoteTotals, calcLineExtended, calcLineMonthly,
  fmtCurrency, STATUS_META, emptyLineItem, emptyGroup,
  emptyPackageLine, emptySubLineItem,
  syncDiscountFromPercent, syncDiscountFromAmount,
  isQuantityEditable, isIncluded, getUnitLabel,
} from '../data/quotes';
import { isBundleProduct } from '../data/catalog';
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
            <i className="fa-solid fa-arrow-left" /> Back to Quotes
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
    })),
    groups: q.groups || [],
  };
};

export default function QuoteDetail(props) {
  return (
    <QuoteDetailErrorBoundary onBack={props.onBack}>
      <QuoteDetailInner {...props} />
    </QuoteDetailErrorBoundary>
  );
}

function QuoteDetailInner({ quote, products, pricebooks, onSave, onBack, onDelete }) {
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
  const [addingToPackageId, setAddingToPackageId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
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
    const labels = { submitted: 'Submit', won: 'Mark as Won', lost: 'Mark as Lost', cancelled: 'Cancel' };
    setConfirm({
      msg: `${labels[newStatus] || 'Change status of'} this quote?`,
      label: labels[newStatus] || 'Confirm',
      fn: () => {
        persistQuote((prev) => ({ ...prev, status: newStatus }));
        setConfirm(null);
      },
    });
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

  const statusOptions = () => {
    const opts = [];
    if (q.status === 'draft') opts.push('submitted');
    if (q.status === 'draft' || q.status === 'submitted') opts.push('won', 'lost');
    if (q.status !== 'cancelled' && q.status !== 'won' && q.status !== 'lost') opts.push('cancelled');
    return opts;
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
      return <span className="cell-locked">{dval}</span>;
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
    if (field === 'discount_percent') display = `${val}%`;
    else if (field === 'discount_amount' || field === 'list_price' || field === 'net_price') display = fmtCurrency(val);
    else display = val;

    return (
      <span className="cell-editable" onClick={() => setEditingCell(cellKey)}>
        {display}
      </span>
    );
  };

  // ════════════════════════════════════════
  //  VIEW MODE
  // ════════════════════════════════════════
  const renderViewMode = () => {
    const viewItems = q.line_items.filter((l) => !l.parent_line_id);

    const renderViewRow = (line) => {
      if (line.is_package) {
        const subs = getSubLines(q.line_items, line.id);
        const expanded = !collapsedPkgs.has(line.id);
        const pkgTotal = calcPkgExtended(q.line_items, line.id);
        return (
          <React.Fragment key={line.id}>
            <tr className="line-row-package">
              <td className="line-td-product">
                <button className="pkg-chevron" onClick={() => togglePackage(line.id)}>
                  <i className={`fa-solid fa-chevron-${expanded ? 'down' : 'right'}`} />
                </button>
                <div style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                  <div className="cell-name">{line.product_name}<span className="pkg-badge">PKG</span></div>
                  <div className="cell-sku">{subs.length} component{subs.length !== 1 ? 's' : ''}</div>
                </div>
              </td>
              <td><span className="cell-sku">Package</span></td>
              <td><span className="cell-locked">—</span></td>
              <td><span className="cell-locked">—</span></td>
              <td><span className="cell-locked">—</span></td>
              <td><span className="cell-locked">—</span></td>
              <td><span className="price-monthly">{fmtCurrency(pkgTotal)}</span></td>
            </tr>
            {expanded && subs.map((sub) => {
              const ext = calcLineExtended(sub);
              return (
                <tr key={sub.id} className="line-row-sub">
                  <td className="line-td-product" style={{ paddingLeft: 36 }}>
                    <div className="cell-name">{sub.product_name}</div>
                  </td>
                  <td><span className="cell-sku">{getUnitLabel(sub.unit_type || 'flat')}</span></td>
                  <td>{sub.quantity}</td>
                  <td>{fmtCurrency(sub.list_price ?? 0)}</td>
                  <td>{(sub.discount_percent ?? 0) > 0 ? `${sub.discount_percent}%` : '—'}</td>
                  <td>{fmtCurrency(sub.net_price ?? sub.list_price ?? 0)}</td>
                  <td><span className="price-monthly">{fmtCurrency(ext)}</span></td>
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
          <td className="line-td-product">
            <div className="cell-name">{line.product_name}</div>
          </td>
          <td><span className="cell-sku">{getUnitLabel(unitType)}</span></td>
          <td>{line.quantity}</td>
          <td>{isIncluded(unitType) ? '—' : fmtCurrency(line.list_price ?? 0)}</td>
          <td>{isIncluded(unitType) ? '—' : ((line.discount_percent ?? 0) > 0 ? `${line.discount_percent}%` : '—')}</td>
          <td>{isIncluded(unitType) ? '$0' : fmtCurrency(line.net_price ?? line.list_price ?? 0)}</td>
          <td><span className="price-monthly">{isIncluded(unitType) ? '$0' : fmtCurrency(extended)}</span></td>
        </tr>
      );
    };

    return (
      <div className="quote-detail">
        {/* Header */}
        <div className="qd-header">
          <button className="back-btn" onClick={onBack}>
            <i className="fa-solid fa-arrow-left" /> Back to Quotes
          </button>
          <div className="qd-header-row">
            <div className="qd-header-info">
              <div className="qd-quote-number">{q.quote_number}</div>
              <h1 className="qd-title">{q.name || 'Untitled Quote'}</h1>
              <div className="qd-meta">
                {q.customer_name && <span>{q.customer_name}</span>}
                <span className={`status-badge status-${meta.color}`}>{meta.label}</span>
                <span>{q.term_months}mo term</span>
                {q.start_date && <span>{q.start_date} &rarr; {q.end_date || '...'}</span>}
                {q.header_discount > 0 && <span>{q.header_discount}% quote discount</span>}
              </div>
            </div>
            <div className="qd-actions">
              <button className="qd-status-btn qd-edit-lines-btn" onClick={enterEditMode} style={{ background: '#05BDBA', color: '#fff', fontWeight: 600, border: 'none', borderRadius: '6px', padding: '8px 16px', height: '36px', cursor: 'pointer' }}>
                <i className={`fa-solid ${q.line_items.length === 0 ? 'fa-plus' : 'fa-pen-to-square'}`} /> {q.line_items.length === 0 ? 'Add Lines' : 'Edit Lines'}
              </button>
              {statusOptions().map((s) => (
                <button key={s} className="qd-status-btn" onClick={() => changeStatus(s)}>
                  {STATUS_META[s]?.label || s}
                </button>
              ))}
              <button className="qd-status-btn" onClick={() => generateQuotePdf(q)}>
                PDF
              </button>
              <div className="qd-more-wrap" ref={moreRef}>
                <button className="qd-more-btn" onClick={() => setShowMoreMenu(!showMoreMenu)}>
                  <i className="fa-solid fa-ellipsis" />
                </button>
                {showMoreMenu && (
                  <div className="qd-more-menu">
                    <button className="qd-more-item qd-more-danger" onClick={() => { setShowMoreMenu(false); onDelete(q.id); }}>
                      <i className="fa-solid fa-trash-can" /> Delete quote
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Customer Info */}
        {(q.customer_name || q.customer_address || q.billing_contact_name || q.billing_contact_email || q.billing_contact_phone) && (
          <div className="qd-customer-info">
            <div className="qd-customer-col">
              {q.customer_name && <div className="qd-customer-company">{q.customer_name}</div>}
              {q.customer_address && <div className="qd-customer-address">{q.customer_address}</div>}
            </div>
            {(q.billing_contact_name || q.billing_contact_email || q.billing_contact_phone) && (
              <div className="qd-customer-col">
                <div className="qd-customer-section-label">Billing Contact</div>
                {q.billing_contact_name && <div className="qd-customer-field">{q.billing_contact_name}</div>}
                {q.billing_contact_email && <div className="qd-customer-field">{q.billing_contact_email}</div>}
                {q.billing_contact_phone && <div className="qd-customer-field">{q.billing_contact_phone}</div>}
              </div>
            )}
          </div>
        )}

        {/* Read-only line items table */}
        <div className="qd-lines-section">
          <div className="line-editor-header">
            <div className="line-editor-title">Line Items</div>
          </div>

          {q.line_items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><i className="fa-solid fa-list" /></div>
              <div className="empty-state-title">No line items</div>
              <div className="empty-state-text">Click "Edit Lines" to add products to this quote</div>
            </div>
          ) : (
            <table className="data-table line-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit</th>
                  <th>Qty</th>
                  <th>List Price</th>
                  <th>Disc %</th>
                  <th>Net Price</th>
                  <th>Extended</th>
                </tr>
              </thead>
              <tbody>{viewItems.map(renderViewRow)}</tbody>
            </table>
          )}
        </div>

        {/* Summary */}
        {renderSummary(totals, q)}

        {/* Footer info */}
        {renderFooterInfo(q)}

        {/* Confirm modal */}
        {confirm && renderConfirmModal()}
      </div>
    );
  };

  // ════════════════════════════════════════
  //  EDIT MODE
  // ════════════════════════════════════════
  const renderEditMode = () => {
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
          <th className="col-drag" />
          <th>Product</th>
          <th>SKU</th>
          <th>Unit</th>
          <th>Qty</th>
          <th>List Price</th>
          <th>Disc %</th>
          <th>Disc $</th>
          <th>Net Price</th>
          <th>Extended</th>
          <th className="col-actions" />
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
          <td className="col-drag"><i className="fa-solid fa-grip-vertical drag-handle" /></td>
          <td className="line-td-product"><div className="cell-name">{line.product_name}</div></td>
          <td><span className="cell-sku">{line.product_sku}</span></td>
          <td><span className="cell-sku">{getUnitLabel(unitType)}</span></td>
          <td>
            {included
              ? <span className="cell-locked">1</span>
              : renderEditableCell(line, 'quantity', { step: '1', min: '1' })}
          </td>
          <td>
            {included
              ? <span className="price-annual">—</span>
              : renderEditableCell(line, 'list_price', { step: '0.01', min: '0' })}
          </td>
          <td>
            {included
              ? <span className="price-annual">—</span>
              : renderEditableCell(line, 'discount_percent', { step: '0.1', min: '0', max: '100' })}
          </td>
          <td>
            {included
              ? <span className="price-annual">—</span>
              : renderEditableCell(line, 'discount_amount', { step: '0.01', min: '0' })}
          </td>
          <td>
            {included
              ? <span className="price-annual">$0</span>
              : <span className="price-monthly">{fmtCurrency(line.net_price ?? line.list_price ?? 0)}</span>}
          </td>
          <td>
            {included
              ? <span className="price-annual">$0</span>
              : <span className="price-monthly">{fmtCurrency(extended)}</span>}
          </td>
          <td className="col-actions">
            <div className="actions-group">
              {groups.length > 0 && (
                <select
                  className="group-assign"
                  value={line.group_id || ''}
                  onChange={(e) => updateDraftLineField(line.id, 'group_id', e.target.value || null)}
                  title="Assign to group"
                >
                  <option value="">No group</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              <button className="action-btn delete line-remove-btn" title="Remove" onClick={() => removeDraftLine(line.id)}>
                <i className="fa-solid fa-trash-can" />
              </button>
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
            <td className="col-drag"><i className="fa-solid fa-grip-vertical drag-handle" /></td>
            <td className="line-td-product">
              <button className="pkg-chevron" onClick={() => togglePackage(line.id)}>
                <i className={`fa-solid fa-chevron-${expanded ? 'down' : 'right'}`} />
              </button>
              <div style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                <div className="cell-name">{line.product_name}<span className="pkg-badge">PKG</span></div>
                <div className="cell-sku">{subs.length} component{subs.length !== 1 ? 's' : ''}</div>
              </div>
            </td>
            <td><span className="cell-sku">{line.product_sku}</span></td>
            <td><span className="cell-sku">Package</span></td>
            <td><span className="cell-locked">—</span></td>
            <td><span className="cell-locked">—</span></td>
            <td><span className="cell-locked">—</span></td>
            <td><span className="cell-locked">—</span></td>
            <td><span className="cell-locked">—</span></td>
            <td><span className="price-monthly">{fmtCurrency(pkgTotal)}</span></td>
            <td className="col-actions">
              <div className="actions-group">
                <button className="action-btn delete line-remove-btn" title="Remove package" onClick={() => removeDraftLine(line.id)}>
                  <i className="fa-solid fa-trash-can" />
                </button>
              </div>
            </td>
          </tr>
          {expanded && subs.map((sub) => {
            const unitType = sub.unit_type || 'flat';
            const ext = calcLineExtended(sub);
            return (
              <tr
                key={sub.id}
                className={`line-row-sub${dropTargetId === sub.id ? ' drag-over' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, sub.id, 'sub', line.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, sub.id, 'sub', line.id)}
                onDrop={(e) => handleDrop(e, sub.id, 'sub', line.id)}
              >
                <td className="col-drag" style={{ paddingLeft: 20 }}><i className="fa-solid fa-grip-vertical drag-handle" /></td>
                <td className="line-td-product" style={{ paddingLeft: 16 }}>
                  <div className="cell-name">{sub.product_name}</div>
                  <div className="cell-sku">{sub.product_sku}</div>
                </td>
                <td><span className="cell-sku">{sub.product_sku}</span></td>
                <td><span className="cell-sku">{getUnitLabel(unitType)}</span></td>
                <td>{renderEditableCell(sub, 'quantity', { step: '1', min: '1' })}</td>
                <td>{renderEditableCell(sub, 'list_price', { step: '0.01', min: '0' })}</td>
                <td>{renderEditableCell(sub, 'discount_percent', { step: '0.1', min: '0', max: '100' })}</td>
                <td>{renderEditableCell(sub, 'discount_amount', { step: '0.01', min: '0' })}</td>
                <td><span className="price-monthly">{fmtCurrency(sub.net_price ?? sub.list_price ?? 0)}</span></td>
                <td><span className="price-monthly">{fmtCurrency(ext)}</span></td>
                <td className="col-actions">
                  <div className="actions-group">
                    <button className="action-btn delete line-remove-btn" title="Remove" onClick={() => removeDraftLine(sub.id)}>
                      <i className="fa-solid fa-trash-can" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {expanded && (
            <tr className="line-row-sub">
              <td colSpan={11} style={{ paddingLeft: 36 }}>
                <button
                  type="button"
                  className="pkg-add-component-link"
                  onClick={() => setAddingToPackageId(addingToPackageId === line.id ? null : line.id)}
                >
                  <i className="fa-solid fa-plus" /> Add Component
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

    return (
      <div className="quote-detail qd-edit-mode">
        {/* Edit mode header */}
        <div className="qd-edit-header">
          <div className="qd-edit-header-info">
            <div className="qd-edit-title">
              Editing Lines — <span className="qd-edit-quote-name">{q.name || 'Untitled Quote'}</span>
            </div>
            <div className="qd-edit-subtitle">{q.quote_number}</div>
          </div>
          <div className="qd-edit-header-actions">
            <button className="btn-secondary" onClick={cancelEdit}>Cancel</button>
            <button className="btn-save" onClick={saveEdit}>Save</button>
          </div>
        </div>

        {/* Edit line items table */}
        <div className="qd-lines-section">
          {items.length === 0 ? (
            <div className="edit-empty-state">
              <div className="edit-empty-icon"><i className="fa-solid fa-plus" /></div>
              <div className="edit-empty-title">Start building your quote</div>
              <div className="edit-empty-text">Select products from the catalog to get started</div>
              <button className="edit-empty-cta" onClick={() => setShowPicker(true)}>
                <i className="fa-solid fa-box-open" /> Browse Products
              </button>
            </div>
          ) : (
            <div className="line-editor-table-wrap">
              {topLevel.length > 0 && (
                <table className="data-table line-table">
                  {editTableHead}
                  <tbody>{topLevel.map(renderEditRow)}</tbody>
                </table>
              )}

              {groups.map((group) => {
                const gLines = groupedItems(group.id);
                return (
                  <div key={group.id} className="line-group">
                    <div className="line-group-header">
                      <div className="line-group-name">
                        <i className="fa-solid fa-layer-group" /> {group.name}
                      </div>
                      <div className="line-group-meta">
                        <span className="line-group-subtotal">{fmtCurrency(groupSubtotal(group.id))}/mo</span>
                        <button className="action-btn delete" title="Remove group" onClick={() => removeDraftGroup(group.id)}>
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </div>
                    </div>
                    {gLines.length > 0 ? (
                      <table className="data-table line-table">
                        {editTableHead}
                        <tbody>{gLines.map(renderEditRow)}</tbody>
                      </table>
                    ) : (
                      <div className="line-group-empty">No lines in this group. Assign lines using the dropdown.</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="qd-line-footer-actions">
            <button className="btn-primary" onClick={() => setShowPicker(true)}>
              <i className="fa-solid fa-plus" /> Add Product
            </button>
            <button className="qd-new-group-link" onClick={() => setShowGroupModal(true)}>
              + New Group
            </button>
          </div>
        </div>

        {/* Running totals with editable quote discount */}
        <div className="qd-summary">
          <div className="qd-summary-item">
            <div className="qd-summary-label">Quote Discount %</div>
            <div className="qd-summary-value">
              <input
                className="inline-edit qd-discount-input"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={hd}
                onChange={(e) => updateDraft((d) => ({ ...d, header_discount: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div className="qd-summary-divider" />
          <div className="qd-summary-item">
            <div className="qd-summary-label">MRR</div>
            {totals.hasQuoteDiscount && <div className="qd-summary-pre">{fmtCurrency(totals.preDiscountMonthly)}</div>}
            <AnimatedValue value={fmtCurrency(totals.monthly)} pulseKey={pulseKey} />
          </div>
          <div className="qd-summary-divider" />
          <div className="qd-summary-item">
            <div className="qd-summary-label">ARR</div>
            {totals.hasQuoteDiscount && <div className="qd-summary-pre">{fmtCurrency(totals.preDiscountAnnual)}</div>}
            <AnimatedValue value={fmtCurrency(totals.annual)} pulseKey={pulseKey} />
          </div>
          <div className="qd-summary-divider" />
          <div className="qd-summary-item qd-summary-tcv">
            <div className="qd-summary-label">TCV ({q.term_months}mo)</div>
            {totals.hasQuoteDiscount && <div className="qd-summary-pre">{fmtCurrency(totals.preDiscountTcv)}</div>}
            <AnimatedValue value={fmtCurrency(totals.tcv)} pulseKey={pulseKey} />
          </div>
        </div>

        {/* Modals */}
        {showPicker && (
          <ProductPicker
            products={availableProducts}
            onAdd={addLineToDraft}
            onClose={() => setShowPicker(false)}
            multiSelect
            existingProductIds={new Set((draft?.line_items || []).map((l) => l.product_id))}
          />
        )}
        {addingToPackageId && (
          <ProductPicker
            products={availableProducts.filter((p) => !isBundleProduct(p))}
            onAdd={(product) => addSubComponentToDraft(product, addingToPackageId)}
            onClose={() => setAddingToPackageId(null)}
          />
        )}
        {showGroupModal && (
          <div className="modal-overlay" onClick={() => { setShowGroupModal(false); setGroupName(''); }}>
            <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">New Group</div>
              <div className="field">
                <label className="field-label">Group Name</label>
                <input
                  className="field-input"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Platform Services"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') addDraftGroup(); }}
                />
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => { setShowGroupModal(false); setGroupName(''); }}>Cancel</button>
                <button className="btn-save" onClick={addDraftGroup} disabled={!groupName.trim()}>Create Group</button>
              </div>
            </div>
          </div>
        )}
      </div>
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
      <div className="qd-summary-divider" />
      <div className="qd-summary-item">
        <div className="qd-summary-label">ARR</div>
        {t.hasQuoteDiscount && <div className="qd-summary-pre">{fmtCurrency(t.preDiscountAnnual)}</div>}
        <AnimatedValue value={fmtCurrency(t.annual)} pulseKey={pulseKey} />
      </div>
      <div className="qd-summary-divider" />
      <div className="qd-summary-item qd-summary-tcv">
        <div className="qd-summary-label">TCV ({source.term_months}mo)</div>
        {t.hasQuoteDiscount && <div className="qd-summary-pre">{fmtCurrency(t.preDiscountTcv)}</div>}
        <AnimatedValue value={fmtCurrency(t.tcv)} pulseKey={pulseKey} />
      </div>
      {t.hasQuoteDiscount && (
        <>
          <div className="qd-summary-divider" />
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

  return mode === 'edit' ? renderEditMode() : renderViewMode();
}
