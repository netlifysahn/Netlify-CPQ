import React, { useState, useEffect, useRef, useMemo, Component } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { isRichTextEmpty, toRichTextHtml } from '../utils/richText';
import {
  calcQuoteTotals, calcLineExtended, fmtCurrency,
  emptyLineItem, emptyPackageLine, emptySubLineItem,
  syncDiscountFromPercent, syncDiscountFromAmount,
  isIncluded, isQuantityEditable, getEffectiveLineQuantity,
  getPackageComponentSection, getPackageProductComponents,
  isPackageComponentQtyEditable, isPackageComponentQtyVisible,
} from '../data/quotes';
import { isBundleProduct, TYPE_LABELS, getProductCategory, genId } from '../data/catalog';
import { generateQuotePDF } from '../utils/generateQuotePDF';

const ORDER_STATUS_META = {
  draft:     { label: 'Draft',     color: 'grey'   },
  active:    { label: 'Active',    color: 'teal'   },
  pending:   { label: 'Pending',   color: 'yellow' },
  invoiced:  { label: 'Invoiced',  color: 'blue'   },
  completed: { label: 'Completed', color: 'green'  },
  cancelled: { label: 'Cancelled', color: 'red'    },
};

const fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const displayCurrency = (v) => {
  const n = typeof v === 'number' && !isNaN(v) ? v : 0;
  return n === 0 ? '—' : fmtCurrency(n);
};

const displayCurrencyValue = (v) => fmtCurrency(typeof v === 'number' && !isNaN(v) ? v : 0);

const fmtQty = (v) => (typeof v === 'number' && !isNaN(v) ? v : 0).toLocaleString('en-US');

class OrderDetailErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary-wrap">
          <button className="back-btn" onClick={this.props.onBack}>Back to Orders</button>
          <h2 className="error-boundary-heading">Something went wrong</h2>
          <pre className="error-boundary-trace">{this.state.error?.message || String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function normalizeOrder(o) {
  if (!o || typeof o !== 'object') return { id: 'error', order_number: 'ERR', name: 'Invalid Order', status: 'draft', term_months: 12, header_discount: 0, line_items: [], groups: [] };
  return {
    ...o,
    status: o.status || 'draft',
    term_months: o.term_months || 12,
    header_discount: o.header_discount || 0,
    line_items: (o.line_items || []).map((l) => ({
      ...l,
      unit_type: l.unit_type || 'flat',
      quantity: getEffectiveLineQuantity(l),
      list_price: l.list_price ?? l.sales_price ?? 0,
      discount_percent: l.discount_percent ?? 0,
      discount_amount: l.discount_amount ?? 0,
      net_price: l.net_price ?? l.list_price ?? l.sales_price ?? 0,
      product_name: l.product_name || l.name || 'Unknown Product',
      product_sku: l.product_sku || l.sku || '',
      product_type: l.product_type || getProductCategory({ category: l.product_type }),
      is_package: l.is_package || false,
      parent_line_id: l.parent_line_id || null,
      price_behavior: l.price_behavior || (l.parent_line_id ? 'included' : undefined),
    })),
    groups: o.groups || [],
    activity_log: o.activity_log || [{ type: 'created', timestamp: o.created_at || new Date().toISOString(), note: 'Order created', actor: o.prepared_by || '' }],
  };
}

function DetailInput({ label, field, value, placeholder, span2, type, mono, textarea, options, onChange, onBlur, readOnly }) {
  const inputCls = `qd-dc-input${mono ? ' qd-dc-input--mono' : ''}`;
  const handleChange = (e) => onChange(field, e.target.value);
  const handleBlur = (e) => onBlur(field, e.target.value);
  let input;
  if (readOnly) {
    input = <div className={`${inputCls} qd-dc-input--height qd-dc-input--readonly`}>{value || '\u2014'}</div>;
  } else if (textarea) {
    input = <textarea className={`${inputCls} qd-dc-input--textarea`} value={value || ''} placeholder={placeholder} onChange={handleChange} onBlur={handleBlur} />;
  } else if (options) {
    input = (
      <select className={`qd-detail-input-select ${inputCls} qd-dc-input--select`} value={value || ''} onChange={(e) => { handleChange(e); onBlur(field, e.target.value); }} onBlur={handleBlur}>
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  } else {
    input = <input type={type || 'text'} className={`${inputCls} qd-dc-input--height`} value={value || ''} placeholder={placeholder} onChange={handleChange} onBlur={handleBlur} />;
  }
  return (
    <div className={span2 ? 'qd-dc-span2' : undefined}>
      <div className="qd-dc-label">{label}</div>
      {input}
    </div>
  );
}

export default function OrderDetail(props) {
  return (
    <OrderDetailErrorBoundary onBack={props.onBack}>
      <OrderDetailInner {...props} />
    </OrderDetailErrorBoundary>
  );
}

function OrderDetailInner({ order, products, pricebooks, settings, onSave, onBack, onDelete, onClone }) {
  const [o, setO] = useState(() => normalizeOrder(order));
  const [mode, setMode] = useState('view');
  const [draft, setDraft] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [detailCards, setDetailCards] = useState({ customer: false, term: false, billing: false, terms_conditions: false });
  const [editingTitle, setEditingTitle] = useState(false);
  const [toast, setToast] = useState(null);
  const moreRef = useRef(null);

  useEffect(() => {
    if (mode === 'edit') return;
    setO(normalizeOrder(order));
  }, [order, mode]);

  useEffect(() => {
    const handler = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setShowMoreMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const persistOrder = (fn) => {
    setO((prev) => {
      const next = fn(prev);
      next.updated_at = new Date().toISOString();
      onSave(next);
      return next;
    });
  };

  const enterEditMode = () => {
    setDraft({
      line_items: JSON.parse(JSON.stringify(o.line_items)),
      groups: JSON.parse(JSON.stringify(o.groups)),
      header_discount: o.header_discount || 0,
    });
    setMode('edit');
  };

  const saveEdit = () => {
    const updated = { ...o, line_items: draft.line_items, groups: draft.groups, header_discount: draft.header_discount, updated_at: new Date().toISOString() };
    setO(updated);
    onSave(updated);
    setDraft(null);
    setMode('view');
  };

  const cancelEdit = () => { setDraft(null); setMode('view'); };
  const updateDraft = (fn) => setDraft((prev) => fn({ ...prev }));

  const getSelectedPricebook = () => (pricebooks || []).find((pb) => pb.id === o.pricebook_id) || null;

  const getPriceOverride = (productId) => {
    const pb = getSelectedPricebook();
    const entry = pb?.entries?.find((e) => e.product_id === productId && e?.is_active !== false);
    if (!entry) return undefined;
    return entry.list_price_override != null ? entry.list_price_override : entry.price_override;
  };

  const productsById = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products]);

  const liveData = mode === 'edit' && draft
    ? { line_items: draft.line_items, groups: draft.groups, header_discount: draft.header_discount, term_months: o.term_months }
    : o;

  const totals = calcQuoteTotals(liveData);
  const meta = ORDER_STATUS_META[o.status] || ORDER_STATUS_META.draft;
  const isEditing = mode === 'edit';
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleFieldChange = (field, value) => setO((p) => ({ ...p, [field]: value }));
  const handleFieldBlur = (field, value) => persistOrder((prev) => ({ ...prev, [field]: value }));

  const toggleCard = (key) => setDetailCards((p) => ({ ...p, [key]: !p[key] }));

  const changeStatus = (newStatus) => {
    persistOrder((prev) => ({
      ...prev,
      status: newStatus,
      activity_log: [...(prev.activity_log || []), {
        type: 'status_change', from_status: prev.status, to_status: newStatus,
        timestamp: new Date().toISOString(), actor: prev.prepared_by || '',
      }],
    }));
  };

  const quillModules = useMemo(() => ({
    toolbar: [['bold', 'italic', 'underline'], [{ list: 'bullet' }, { list: 'ordered' }], ['link']],
  }), []);
  const quillFormats = useMemo(() => ['bold', 'italic', 'underline', 'list', 'bullet', 'link'], []);

  const renderDetailCards = () => (
    <div className="qd-detail-card-wrap">
      <div>
        <div className="qd-category-card-header qd-detail-card-header qd-detail-card-header--clickable" onClick={() => toggleCard('customer')}>
          <span className="qd-category-card-title">Customer Information</span>
          <span className="qd-detail-card-chevron">{detailCards.customer ? '▾' : '▸'}</span>
        </div>
        {detailCards.customer && (
          <div className="qd-detail-card-body">
            <DetailInput label="Customer Name" field="customer_name" value={o.customer_name} placeholder="Company name" span2 onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Address" field="address" value={o.address} placeholder="Street, City, State, ZIP, Country" span2 onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Primary Contact Name" field="contact_name" value={o.contact_name} placeholder="Full name" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Primary Contact Email" field="contact_email" value={o.contact_email} placeholder="contact@company.com" type="email" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Billing Contact Name" field="billing_contact_name" value={o.billing_contact_name} placeholder="Full name" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Billing Contact Email" field="billing_contact_email" value={o.billing_contact_email} placeholder="billing@company.com" type="email" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Invoice Email" field="invoice_email" value={o.invoice_email} placeholder="invoices@company.com" type="email" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Netlify Account ID" field="account_id" value={o.account_id} placeholder="e.g. acct_abc123" mono onChange={handleFieldChange} onBlur={handleFieldBlur} />
          </div>
        )}
      </div>
      <div className="qd-section-divider" />
      <div>
        <div className="qd-category-card-header qd-detail-card-header qd-detail-card-header--clickable" onClick={() => toggleCard('term')}>
          <span className="qd-category-card-title">Subscription Term</span>
          <span className="qd-detail-card-chevron">{detailCards.term ? '▾' : '▸'}</span>
        </div>
        {detailCards.term && (
          <div className="qd-detail-card-body">
            <DetailInput label="Subscription Start Date" field="start_date" value={o.start_date} type="date" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Subscription Term (Months)" field="term_months" value={o.term_months} placeholder="12" onChange={handleFieldChange} onBlur={handleFieldBlur} />
          </div>
        )}
      </div>
      <div className="qd-section-divider" />
      <div>
        <div className="qd-category-card-header qd-detail-card-header qd-detail-card-header--clickable" onClick={() => toggleCard('billing')}>
          <span className="qd-category-card-title">Billing &amp; Payment</span>
          <span className="qd-detail-card-chevron">{detailCards.billing ? '▾' : '▸'}</span>
        </div>
        {detailCards.billing && (
          <div className="qd-detail-card-body">
            <DetailInput label="Billing Schedule" field="billing_schedule" value={o.billing_schedule} options={['Annual','Semi-Annual','Quarterly','Monthly']} onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Payment Method" field="payment_method" value={o.payment_method} options={['Credit Card','ACH / Bank Transfer','Wire Transfer','Check','Invoice']} onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Payment Terms" field="payment_terms" value={o.payment_terms} options={['Net 30','Net 45','Net 60','Due on Receipt']} onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="PO #" field="po_number" value={o.po_number} placeholder="Optional" mono onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="VAT #" field="vat_number" value={o.vat_number} placeholder="Optional" mono onChange={handleFieldChange} onBlur={handleFieldBlur} />
          </div>
        )}
      </div>
      <div className="qd-section-divider" />
      <div>
        <div className="qd-category-card-header qd-detail-card-header qd-detail-card-header--clickable" onClick={() => toggleCard('terms_conditions')}>
          <span className="qd-category-card-title">Terms &amp; Conditions</span>
          <span className="qd-detail-card-chevron">{detailCards.terms_conditions ? '▾' : '▸'}</span>
        </div>
        {detailCards.terms_conditions && (
          <div className="qd-detail-card-body qd-detail-card-body--terms">
            <div className="qd-terms-editor">
              <ReactQuill
                className="qd-terms-quill"
                value={toRichTextHtml(o.terms_conditions || '')}
                onChange={(value) => handleFieldChange('terms_conditions', isRichTextEmpty(value) ? '' : value)}
                onBlur={() => handleFieldBlur('terms_conditions', o.terms_conditions || '')}
                placeholder="Add order-specific terms here..."
                modules={quillModules}
                formats={quillFormats}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const getLineCategory = (line) => {
    if (!line) return 'platform';
    if (line.product_type) return getProductCategory({ category: line.product_type });
    return getProductCategory(productsById.get(line.product_id));
  };

  const groupLinesByCategory = (items) => {
    const CARD_ORDER = items.some((l) => l.is_package)
      ? ['bundle', 'support', 'addon', 'entitlements']
      : ['platform', 'support', 'addon', 'entitlements'];
    const topLevel = items.filter((l) => !l.parent_line_id);
    const groups = {};
    topLevel.forEach((line) => {
      const cat = line.is_package ? 'bundle' : (line.product_type || 'platform');
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(line);
    });
    return CARD_ORDER.filter((cat) => groups[cat]?.length > 0).map((cat) => ({
      category: cat,
      label: TYPE_LABELS[cat] || cat,
      lines: groups[cat],
    }));
  };

  const getSubLines = (items, parentId) => items.filter((l) => l.parent_line_id === parentId);

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

  return (
    <div className={`quote-detail${isEditing ? ' quote-detail--editing' : ''}`}>
      <div className="qd-header">
        <button className="back-btn" onClick={onBack}>Back to Orders</button>
        <div className="qd-header-info" style={{ flex: 1 }}>
          <div className="qd-quote-number">{o.order_number}</div>
          <div className="qd-header-title-row">
            {editingTitle ? (
              <input autoFocus type="text" value={o.name} placeholder="Order name"
                onChange={(e) => setO((prev) => ({ ...prev, name: e.target.value }))}
                onBlur={(e) => { setEditingTitle(false); persistOrder((prev) => ({ ...prev, name: e.target.value })); }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingTitle(false); }}
                className="qd-title-input" />
            ) : (
              <h1 className="qd-title" onClick={() => setEditingTitle(true)} style={{ cursor: 'pointer', flex: 1 }}>
                {o.name || 'Untitled Order'}
              </h1>
            )}
            <span className={`qd-status-pill qd-status-pill--${meta.color}`}>{meta.label}</span>
          </div>
        </div>
      </div>

      <div className="qd-action-bar">
        {isEditing ? (
          <div className="qd-action-group">
            <button className="qd-action-btn" onClick={cancelEdit}>Cancel</button>
            <button className="qd-action-btn qd-action-btn-primary" onClick={saveEdit}>Save</button>
          </div>
        ) : (
          <div className="qd-action-group">
            <button className="qd-action-btn" onClick={enterEditMode}>
              {o.line_items.length === 0 ? 'Add Lines' : 'Edit Lines'}
            </button>
            <button className="qd-action-btn" onClick={() => generateQuotePDF(o, products, settings, { preview: true })}>
              Preview PDF
            </button>
            <button className="qd-action-btn" onClick={() => generateQuotePDF(o, products, settings)}>
              Download PDF
            </button>

            {o.status === 'draft' && (
              <button className="qd-action-btn qd-action-btn-primary" onClick={() => changeStatus('active')}>Activate</button>
            )}
            {o.status === 'active' && (
              <button className="qd-action-btn qd-action-btn-primary" onClick={() => changeStatus('invoiced')}>Mark Invoiced</button>
            )}
            {o.status === 'invoiced' && (
              <button className="qd-action-btn qd-action-btn-primary" onClick={() => changeStatus('completed')}>Mark Completed</button>
            )}

            <div className="qd-more-wrap" ref={moreRef}>
              <button className="qd-more-btn qd-more-btn--reset" onClick={() => setShowMoreMenu(!showMoreMenu)}>···</button>
              {showMoreMenu && (
                <div className="qd-more-menu">
                  <button className="qd-more-item" onClick={() => { setShowMoreMenu(false); onClone(o); }}>Clone Order</button>
                  {o.status !== 'cancelled' && (
                    <button className="qd-more-item" onClick={() => { setShowMoreMenu(false); setConfirm({ msg: 'Cancel this order?', label: 'Cancel Order', fn: () => { changeStatus('cancelled'); setConfirm(null); } }); }}>Cancel Order</button>
                  )}
                  <button className="qd-more-item qd-more-danger" onClick={() => { setShowMoreMenu(false); onDelete(o.id); }}>Delete Order</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {renderDetailCards()}

      <div className={`qd-lines-section${isEditing ? ' qd-lines-section--editing' : ''}`}>
        {o.line_items.length === 0 && !isEditing ? (
          <div className="empty-state">
            <div className="empty-state-numeral">0</div>
            <div className="empty-state-title">No line items</div>
            <div className="empty-state-text">Click "Edit Lines" to add products to this order</div>
          </div>
        ) : (
          <div className="qd-grouped-cards">
            {groupLinesByCategory(o.line_items).map((group) => (
              <div key={group.category} className={`qd-category-card${group.category === 'bundle' ? ' qd-category-card--base-package' : ''}${group.category === 'support' ? ' qd-category-card--support' : ''}`}>
                <div className="qd-category-card-header">
                  <span className="qd-category-card-title">{group.label}</span>
                </div>
                <table className="data-table line-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>List Price</th>
                      <th>Discount</th>
                      <th>Net Price</th>
                      <th>Monthly</th>
                      <th>Annual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.lines.map((line) => {
                      const extended = calcLineExtended(line);
                      const included = isIncluded(line.unit_type || 'flat');
                      return (
                        <tr key={line.id}>
                          <td><div className="cell-name">{line.product_name}</div></td>
                          <td>{getEffectiveLineQuantity(line) > 1 ? fmtQty(getEffectiveLineQuantity(line)) : ''}</td>
                          <td>{included ? '—' : displayCurrency(line.list_price ?? 0)}</td>
                          <td>{included ? '' : displayCurrency(line.discount_amount ?? 0)}</td>
                          <td>{included ? '—' : displayCurrency(line.net_price ?? line.list_price ?? 0)}</td>
                          <td>{included ? '—' : displayCurrency(extended)}</td>
                          <td>{included ? '—' : displayCurrency(extended * 12)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="qd-overage-section qd-summary-row">
        <div className="qd-overage-card qd-pricing-summary-card">
          <div className="qd-category-card-header qd-detail-card-header">
            <span className="qd-category-card-title">Summary</span>
          </div>
          <div className="qd-overage-body qd-pricing-summary-body">
            <div className="qd-pricing-summary-group">
              <div className="qd-pricing-summary-row">
                <span className="qd-pricing-summary-label">Annual Subtotal</span>
                <span className="qd-pricing-summary-value">{fmtCurrency(totals.preDiscountAnnual)}</span>
              </div>
              <div className="qd-pricing-summary-row">
                <span className="qd-pricing-summary-label">Discount</span>
                <span className="qd-pricing-summary-value">
                  {totals.preDiscountAnnual - totals.annual > 0 ? `−${fmtCurrency(totals.preDiscountAnnual - totals.annual)}` : '—'}
                </span>
              </div>
            </div>
            <div className="qd-pricing-summary-divider" />
            <div className="qd-pricing-summary-group">
              <div className="qd-pricing-summary-row qd-pricing-summary-row--bold">
                <span className="qd-pricing-summary-label">Total Monthly</span>
                <span className="qd-pricing-summary-value">{fmtCurrency(totals.monthly)}</span>
              </div>
              <div className="qd-pricing-summary-row qd-pricing-summary-row--bold">
                <span className="qd-pricing-summary-label">Total Annual</span>
                <span className="qd-pricing-summary-value">{fmtCurrency(totals.annual)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="qd-activity-section">
        <div className="qd-footer-label" style={{ marginBottom: '12px' }}>Activity</div>
        <div className="qd-activity-timeline">
          {[...(o.activity_log || [])].reverse().map((entry, i, arr) => {
            let text = '';
            let dotColor = '#05BDBA';
            if (entry.type === 'status_change') {
              const fromMeta = ORDER_STATUS_META[entry.from_status] || {};
              const toMeta = ORDER_STATUS_META[entry.to_status] || {};
              text = `${entry.actor || 'System'} moved order from ${fromMeta.label || entry.from_status} → ${toMeta.label || entry.to_status}`;
              dotColor = { active: '#059669', cancelled: '#ef4444', invoiced: '#2E51ED', completed: '#065f46' }[entry.to_status] || '#6b7280';
            } else if (entry.type === 'created') {
              text = `Order created${entry.actor ? ` by ${entry.actor}` : ''}`;
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
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {toast && <div className="qd-toast">{toast}</div>}
      {confirm && renderConfirmModal()}
    </div>
  );
}
