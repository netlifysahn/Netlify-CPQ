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
          <pre style={{ marginTop: 8, padding: 16, background: 'rgba(0,0,0,0.05)', borderRadius: 8, whiteSpace: 'pre-wrap', fontSize: 11, color: '#888' }}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Backfill missing fields on older quotes so the component never hits undefined
const normalizeQuote = (q) => {
  if (!q || typeof q !== 'object') {
    console.error('[QuoteDetail] normalizeQuote received invalid quote:', q);
    return { id: 'error', quote_number: 'ERR', name: 'Invalid Quote', status: 'draft', term_months: 12, header_discount: 0, line_items: [], groups: [], start_date: '', end_date: '', customer_name: '', customer_address: '', customer_contact: '', billing_contact_name: '', billing_contact_email: '', billing_contact_phone: '', prepared_by: '', comments: '', terms_conditions: '', pricebook_id: null, created_at: '', updated_at: '' };
  }
  const safe = {
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
  return safe;
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
  const [showPicker, setShowPicker] = useState(false);
  const [editingCell, setEditingCell] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [collapsedPkgs, setCollapsedPkgs] = useState(new Set());
  const moreRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setShowMoreMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const update = (fn) => {
    setQ((prev) => {
      const next = fn(prev);
      next.updated_at = new Date().toISOString();
      onSave(next);
      return next;
    });
  };

  const getSelectedPricebook = () => {
    if (!q.pricebook_id) return null;
    return (pricebooks || []).find((pb) => pb.id === q.pricebook_id) || null;
  };

  const addLine = (product) => {
    const pb = getSelectedPricebook();
    const getPriceOverride = (prodId) => {
      const entry = pb?.entries?.find((e) => e.product_id === prodId);
      return entry?.price_override != null ? entry.price_override : undefined;
    };

    if (isBundleProduct(product) && product.members?.length > 0) {
      // Package: create parent + sub-line items
      const parentLine = emptyPackageLine(product);
      const productMap = new Map((products || []).map((p) => [p.id, p]));
      const subLines = product.members
        .filter((m) => productMap.has(m.product_id))
        .map((m) => {
          const memberProduct = productMap.get(m.product_id);
          return emptySubLineItem(memberProduct, m, parentLine.id, getPriceOverride(m.product_id));
        });

      update((prev) => {
        const base = prev.line_items.length;
        return {
          ...prev,
          line_items: [
            ...prev.line_items,
            { ...parentLine, sort_order: base },
            ...subLines.map((sl, i) => ({ ...sl, sort_order: base + 1 + i })),
          ],
        };
      });
    } else {
      // Standalone line item
      const line = emptyLineItem(product, getPriceOverride(product.id));
      update((prev) => ({
        ...prev,
        line_items: [...prev.line_items, { ...line, sort_order: prev.line_items.length }],
      }));
    }
  };

  const availableProducts = (() => {
    const pb = getSelectedPricebook();
    if (!pb || !pb.entries?.length) return products;
    const pbProductIds = new Set(pb.entries.map((e) => e.product_id));
    return products.filter((p) => pbProductIds.has(p.id));
  })();

  const updateLine = (lineId, updates) => {
    update((prev) => ({
      ...prev,
      line_items: prev.line_items.map((l) =>
        l.id === lineId ? { ...l, ...updates } : l
      ),
    }));
    setEditingCell(null);
  };

  const updateLineField = (lineId, field, value) => {
    if (field === 'list_price') {
      const line = q.line_items.find((l) => l.id === lineId);
      if (!line) return;
      const newList = Math.max(0, value);
      const synced = syncDiscountFromPercent(newList, line.discount_percent || 0);
      updateLine(lineId, { list_price: newList, ...synced });
      return;
    }
    updateLine(lineId, { [field]: value });
  };

  const updateDiscount = (lineId, field, value) => {
    const line = q.line_items.find((l) => l.id === lineId);
    if (!line) return;
    const val = parseFloat(value) || 0;
    const synced = field === 'discount_percent'
      ? syncDiscountFromPercent(line.list_price || 0, val)
      : syncDiscountFromAmount(line.list_price || 0, val);
    updateLine(lineId, synced);
  };

  const removeLine = (lineId) => {
    update((prev) => ({
      ...prev,
      // Remove the line and any sub-items that belong to it (if it's a package)
      line_items: prev.line_items.filter((l) => l.id !== lineId && l.parent_line_id !== lineId),
    }));
  };

  const addGroup = () => {
    if (!groupName.trim()) return;
    update((prev) => ({
      ...prev,
      groups: [...prev.groups, { ...emptyGroup(), name: groupName.trim(), sort_order: prev.groups.length }],
    }));
    setGroupName('');
    setShowGroupModal(false);
  };

  const removeGroup = (groupId) => {
    update((prev) => ({
      ...prev,
      groups: prev.groups.filter((g) => g.id !== groupId),
      line_items: prev.line_items.map((l) =>
        l.group_id === groupId ? { ...l, group_id: null } : l
      ),
    }));
  };

  const changeStatus = (newStatus) => {
    const labels = { submitted: 'Submit', won: 'Mark as Won', lost: 'Mark as Lost', cancelled: 'Cancel' };
    setConfirm({
      msg: `${labels[newStatus] || 'Change status of'} this quote?`,
      label: labels[newStatus] || 'Confirm',
      fn: () => {
        update((prev) => ({ ...prev, status: newStatus }));
        setConfirm(null);
      },
    });
  };

  const totals = calcQuoteTotals(q);
  const meta = STATUS_META[q.status] || STATUS_META.draft;

  // Top-level lines: exclude sub-components (they render under their parent)
  const ungrouped = q.line_items.filter((l) => !l.group_id && !l.parent_line_id);
  const groupedLines = (groupId) => q.line_items.filter((l) => l.group_id === groupId && !l.parent_line_id);
  const groupSubtotal = (groupId) => {
    return groupedLines(groupId).reduce((s, l) => s + calcLineMonthly(l, q.header_discount), 0);
  };

  const statusOptions = () => {
    const opts = [];
    if (q.status === 'draft') opts.push('submitted');
    if (q.status === 'draft' || q.status === 'submitted') opts.push('won', 'lost');
    if (q.status !== 'cancelled' && q.status !== 'won' && q.status !== 'lost') opts.push('cancelled');
    return opts;
  };

  const togglePackage = (lineId) => {
    setCollapsedPkgs((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const getSubLines = (parentId) => q.line_items.filter((l) => l.parent_line_id === parentId);

  const calcPackageExtended = (parentId) => {
    return getSubLines(parentId).reduce((s, l) => s + calcLineExtended(l), 0);
  };

  const renderEditableCell = (line, field, opts = {}) => {
    const { type = 'number', step = '1', min, max, suffix = '', prefix = '', disabled = false } = opts;
    const cellKey = `${line.id}-${field}`;
    const isEditing = editingCell === cellKey;

    if (disabled) {
      const dval = typeof line[field] === 'number' ? line[field] : 0;
      return <span className="cell-locked">{prefix + dval + suffix}</span>;
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
              updateDiscount(line.id, field, v);
            } else if (field === 'quantity') {
              updateLineField(line.id, 'quantity', Math.max(1, Math.round(v)));
            } else {
              updateLineField(line.id, field, v);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.target.blur();
            if (e.key === 'Escape') setEditingCell(null);
          }}
        />
      );
    }

    let display;
    const val = line[field] ?? 0;
    if (field === 'discount_percent') display = `${val}%`;
    else if (field === 'discount_amount' || field === 'list_price' || field === 'net_price') display = fmtCurrency(val);
    else display = prefix + val + suffix;

    return (
      <span className="cell-editable" onClick={() => setEditingCell(cellKey)}>
        {display}
      </span>
    );
  };

  // Render a standalone (non-package) line row
  const renderStandaloneRow = (line) => {
    const unitType = line.unit_type || 'flat';
    const included = isIncluded(unitType);
    const qtyEditable = isQuantityEditable(unitType);
    const extended = calcLineExtended(line);

    return (
      <tr key={line.id}>
        <td className="line-td-product">
          <div className="cell-name">{line.product_name}</div>
          <div className="cell-sku">{line.product_sku}</div>
        </td>
        <td><span className="cell-sku">{getUnitLabel(unitType)}</span></td>
        <td>
          {included ? (
            <span className="cell-locked">1</span>
          ) : qtyEditable ? (
            renderEditableCell(line, 'quantity', { step: '1', min: '1' })
          ) : (
            <span className="cell-locked">1</span>
          )}
        </td>
        <td>
          {included ? (
            <span className="price-annual">—</span>
          ) : (
            renderEditableCell(line, 'list_price', { step: '0.01', min: '0' })
          )}
        </td>
        <td>
          {included ? (
            <span className="price-annual">—</span>
          ) : (
            renderEditableCell(line, 'discount_percent', { step: '0.1', min: '0', max: '100' })
          )}
        </td>
        <td>
          {included ? (
            <span className="price-annual">—</span>
          ) : (
            renderEditableCell(line, 'discount_amount', { step: '0.01', min: '0' })
          )}
        </td>
        <td>
          {included ? (
            <span className="price-annual">$0.00</span>
          ) : (
            <span className="price-monthly">{fmtCurrency(line.net_price ?? line.list_price ?? 0)}</span>
          )}
        </td>
        <td>
          {included ? (
            <span className="price-annual">$0.00</span>
          ) : (
            <span className="price-monthly">{fmtCurrency(extended)}</span>
          )}
        </td>
        <td className="col-actions">
          <div className="actions-group">
            {q.groups.length > 0 && (
              <select
                className="group-assign"
                value={line.group_id || ''}
                onChange={(e) => updateLineField(line.id, 'group_id', e.target.value || null)}
                title="Assign to group"
              >
                <option value="">No group</option>
                {q.groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
            <button className="action-btn delete line-remove-btn" title="Remove" onClick={() => removeLine(line.id)}>
              <i className="fa-solid fa-trash-can" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // Render a package parent row with chevron + rolled-up total
  const renderPackageRow = (line) => {
    const expanded = !collapsedPkgs.has(line.id);
    const pkgTotal = calcPackageExtended(line.id);
    const subCount = getSubLines(line.id).length;

    return (
      <tr key={line.id} className="line-row-package">
        <td className="line-td-product">
          <button className="pkg-chevron" onClick={() => togglePackage(line.id)} title={expanded ? 'Collapse' : 'Expand'}>
            <i className={`fa-solid fa-chevron-${expanded ? 'down' : 'right'}`} />
          </button>
          <div style={{ display: 'inline-block', verticalAlign: 'middle' }}>
            <div className="cell-name">{line.product_name}</div>
            <div className="cell-sku">{line.product_sku} &middot; {subCount} component{subCount !== 1 ? 's' : ''}</div>
          </div>
        </td>
        <td><span className="cell-sku">Package</span></td>
        <td><span className="cell-locked">—</span></td>
        <td><span className="cell-locked">—</span></td>
        <td><span className="cell-locked">—</span></td>
        <td><span className="cell-locked">—</span></td>
        <td><span className="cell-locked">—</span></td>
        <td><span className="price-monthly">{fmtCurrency(pkgTotal)}</span></td>
        <td className="col-actions">
          <div className="actions-group">
            <button className="action-btn delete line-remove-btn" title="Remove package" onClick={() => removeLine(line.id)}>
              <i className="fa-solid fa-trash-can" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // Render a sub-line item row (indented under package)
  const renderSubLineRow = (line) => {
    const unitType = line.unit_type || 'flat';
    const extended = calcLineExtended(line);

    return (
      <tr key={line.id} className="line-row-sub">
        <td className="line-td-product" style={{ paddingLeft: 36 }}>
          <div className="cell-name">{line.product_name}</div>
          <div className="cell-sku">{line.product_sku}</div>
        </td>
        <td><span className="cell-sku">{getUnitLabel(unitType)}</span></td>
        <td>{renderEditableCell(line, 'quantity', { step: '1', min: '1' })}</td>
        <td>{renderEditableCell(line, 'list_price', { step: '0.01', min: '0' })}</td>
        <td>{renderEditableCell(line, 'discount_percent', { step: '0.1', min: '0', max: '100' })}</td>
        <td>{renderEditableCell(line, 'discount_amount', { step: '0.01', min: '0' })}</td>
        <td><span className="price-monthly">{fmtCurrency(line.net_price ?? line.list_price ?? 0)}</span></td>
        <td><span className="price-monthly">{fmtCurrency(extended)}</span></td>
        <td className="col-actions">
          <div className="actions-group">
            <button className="action-btn delete line-remove-btn" title="Remove" onClick={() => removeLine(line.id)}>
              <i className="fa-solid fa-trash-can" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // Render a line: dispatches to package, sub-line, or standalone
  const renderLineRow = (line) => {
    // Sub-lines are rendered by their parent, skip them here
    if (line.parent_line_id) return null;

    if (line.is_package) {
      const expanded = !collapsedPkgs.has(line.id);
      const subs = getSubLines(line.id);
      return (
        <React.Fragment key={line.id}>
          {renderPackageRow(line)}
          {expanded && subs.map(renderSubLineRow)}
        </React.Fragment>
      );
    }

    return renderStandaloneRow(line);
  };

  const lineTableHead = (
    <thead>
      <tr>
        <th>Product</th>
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

  return (
    <div className="quote-detail">
      {/* Header */}
      <div className="qd-header">
        <button className="back-btn" onClick={onBack}>
          <i className="fa-solid fa-arrow-left" />
          Back to Quotes
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
                    <i className="fa-solid fa-trash-can" />
                    Delete quote
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

      {/* Line Editor */}
      <div className="qd-lines-section">
        <div className="line-editor-header">
          <div className="line-editor-title">Line Items</div>
          <div className="line-editor-actions">
            <button className="btn-primary" onClick={() => setShowPicker(true)}>
              <i className="fa-solid fa-plus" /> Add Line
            </button>
          </div>
        </div>

        {q.line_items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><i className="fa-solid fa-list" /></div>
            <div className="empty-state-title">No line items</div>
            <div className="empty-state-text">Add products from the catalog to build your quote</div>
          </div>
        ) : (
          <div className="line-editor-table-wrap">
            {ungrouped.length > 0 && (
              <table className="data-table line-table">
                {lineTableHead}
                <tbody>{ungrouped.map(renderLineRow)}</tbody>
              </table>
            )}

            {q.groups.map((group) => {
              const lines = groupedLines(group.id);
              return (
                <div key={group.id} className="line-group">
                  <div className="line-group-header">
                    <div className="line-group-name">
                      <i className="fa-solid fa-layer-group" />
                      {group.name}
                    </div>
                    <div className="line-group-meta">
                      <span className="line-group-subtotal">{fmtCurrency(groupSubtotal(group.id))}/mo</span>
                      <button className="action-btn delete" title="Remove group" onClick={() => removeGroup(group.id)}>
                        <i className="fa-solid fa-xmark" />
                      </button>
                    </div>
                  </div>
                  {lines.length > 0 ? (
                    <table className="data-table line-table">
                      {lineTableHead}
                      <tbody>{lines.map(renderLineRow)}</tbody>
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

      {/* Quote Summary */}
      <div className="qd-summary">
        <div className="qd-summary-item">
          <div className="qd-summary-label">MRR</div>
          {totals.hasQuoteDiscount && (
            <div className="qd-summary-pre">{fmtCurrency(totals.preDiscountMonthly)}</div>
          )}
          <div className="qd-summary-value">{fmtCurrency(totals.monthly)}</div>
        </div>
        <div className="qd-summary-divider" />
        <div className="qd-summary-item">
          <div className="qd-summary-label">ARR</div>
          {totals.hasQuoteDiscount && (
            <div className="qd-summary-pre">{fmtCurrency(totals.preDiscountAnnual)}</div>
          )}
          <div className="qd-summary-value">{fmtCurrency(totals.annual)}</div>
        </div>
        <div className="qd-summary-divider" />
        <div className="qd-summary-item">
          <div className="qd-summary-label">TCV ({q.term_months}mo)</div>
          {totals.hasQuoteDiscount && (
            <div className="qd-summary-pre">{fmtCurrency(totals.preDiscountTcv)}</div>
          )}
          <div className="qd-summary-value">{fmtCurrency(totals.tcv)}</div>
        </div>
        {totals.hasQuoteDiscount && (
          <>
            <div className="qd-summary-divider" />
            <div className="qd-summary-item">
              <div className="qd-summary-label">Quote Discount</div>
              <div className="qd-summary-value">{q.header_discount}%</div>
            </div>
          </>
        )}
      </div>

      {/* Footer info */}
      {(q.comments || q.terms_conditions || q.prepared_by) && (
        <div className="qd-footer-info">
          {q.prepared_by && (
            <div className="qd-footer-row">
              <span className="qd-footer-label">Prepared by</span>
              <span className="qd-footer-value">{q.prepared_by}</span>
            </div>
          )}
          {q.comments && (
            <div className="qd-footer-row">
              <span className="qd-footer-label">Comments</span>
              <span className="qd-footer-value">{q.comments}</span>
            </div>
          )}
          {q.terms_conditions && (
            <div className="qd-footer-row">
              <span className="qd-footer-label">Terms & Conditions</span>
              <span className="qd-footer-value">{q.terms_conditions}</span>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showPicker && (
        <ProductPicker
          products={availableProducts}
          onAdd={addLine}
          onClose={() => setShowPicker(false)}
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
                onKeyDown={(e) => { if (e.key === 'Enter') addGroup(); }}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setShowGroupModal(false); setGroupName(''); }}>Cancel</button>
              <button className="btn-save" onClick={addGroup} disabled={!groupName.trim()}>Create Group</button>
            </div>
          </div>
        </div>
      )}
      {confirm && (
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
      )}
    </div>
  );
}
