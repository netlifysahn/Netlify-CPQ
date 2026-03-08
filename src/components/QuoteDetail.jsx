import React, { useState } from 'react';
import {
  calcQuoteTotals, calcLineMonthly, calcLineTotal,
  fmtCurrency, STATUS_META, emptyLineItem, emptyGroup,
} from '../data/quotes';
import { generateQuotePdf } from '../utils/quotePdf';
import ProductPicker from './ProductPicker';
import Confirm from './Confirm';

export default function QuoteDetail({ quote, products, onSave, onBack, onDelete }) {
  const [q, setQ] = useState(quote);
  const [showPicker, setShowPicker] = useState(false);
  const [editingCell, setEditingCell] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [showGroupInput, setShowGroupInput] = useState(false);

  const update = (fn) => {
    setQ((prev) => {
      const next = fn(prev);
      next.updated_at = new Date().toISOString();
      onSave(next);
      return next;
    });
  };

  const addLine = (product) => {
    update((prev) => ({
      ...prev,
      line_items: [...prev.line_items, { ...emptyLineItem(product), sort_order: prev.line_items.length }],
    }));
  };

  const updateLine = (lineId, field, value) => {
    update((prev) => ({
      ...prev,
      line_items: prev.line_items.map((l) =>
        l.id === lineId ? { ...l, [field]: value } : l
      ),
    }));
    setEditingCell(null);
  };

  const removeLine = (lineId) => {
    update((prev) => ({
      ...prev,
      line_items: prev.line_items.filter((l) => l.id !== lineId),
    }));
  };

  const addGroup = () => {
    if (!groupName.trim()) return;
    update((prev) => ({
      ...prev,
      groups: [...prev.groups, { ...emptyGroup(), name: groupName.trim(), sort_order: prev.groups.length }],
    }));
    setGroupName('');
    setShowGroupInput(false);
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

  // Group lines: ungrouped first, then by group
  const ungrouped = q.line_items.filter((l) => !l.group_id);
  const groupedLines = (groupId) => q.line_items.filter((l) => l.group_id === groupId);
  const groupSubtotal = (groupId) => {
    return groupedLines(groupId).reduce((s, l) => s + calcLineMonthly(l, q.header_discount), 0);
  };

  const renderEditableCell = (line, field, type = 'number') => {
    const cellKey = `${line.id}-${field}`;
    const isEditing = editingCell === cellKey;
    const locked = field === 'quantity' ? line.config.lock_quantity :
      field === 'sales_price' ? line.config.lock_price :
      field === 'line_discount' ? line.config.lock_discount : false;

    if (locked) {
      const val = field === 'sales_price' ? fmtCurrency(line[field]) :
        field === 'line_discount' ? `${line[field]}%` : line[field];
      return <span className="cell-locked">{val}</span>;
    }

    if (isEditing) {
      return (
        <input
          className="inline-edit"
          type={type}
          defaultValue={line[field]}
          autoFocus
          step={field === 'sales_price' ? '0.01' : field === 'line_discount' ? '0.1' : '1'}
          min={field === 'line_discount' ? '0' : undefined}
          max={field === 'line_discount' ? '100' : undefined}
          onBlur={(e) => updateLine(line.id, field, parseFloat(e.target.value) || 0)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') updateLine(line.id, field, parseFloat(e.target.value) || 0);
            if (e.key === 'Escape') setEditingCell(null);
          }}
        />
      );
    }

    const display = field === 'sales_price' ? fmtCurrency(line[field]) :
      field === 'line_discount' ? `${line[field]}%` : line[field];

    return (
      <span className="cell-editable" onClick={() => setEditingCell(cellKey)}>
        {display}
      </span>
    );
  };

  const renderLineRow = (line) => {
    const monthly = calcLineMonthly(line, q.header_discount);
    const total = calcLineTotal(line, q.header_discount);
    return (
      <tr key={line.id}>
        <td>
          <div className="cell-name">{line.product_name}</div>
          <div className="cell-sku">{line.product_sku}</div>
        </td>
        <td>{renderEditableCell(line, 'quantity')}</td>
        <td><span className="price-annual">{fmtCurrency(line.list_price)}</span></td>
        <td>{renderEditableCell(line, 'sales_price')}</td>
        <td>{renderEditableCell(line, 'line_discount')}</td>
        <td><span className="cell-term">{line.term_months}mo</span></td>
        <td><span className="price-monthly">{fmtCurrency(monthly)}</span></td>
        <td><span className="price-monthly">{fmtCurrency(total)}</span></td>
        <td className="col-actions">
          <div className="actions-group">
            {q.groups.length > 0 && (
              <select
                className="group-assign"
                value={line.group_id || ''}
                onChange={(e) => updateLine(line.id, 'group_id', e.target.value || null)}
                title="Assign to group"
              >
                <option value="">No group</option>
                {q.groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
            <button className="action-btn delete" title="Remove" onClick={() => removeLine(line.id)}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="quote-detail">
      {/* Header */}
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          <i className="fa-solid fa-arrow-left" />
          Back to Quotes
        </button>
        <div className="detail-header-row">
          <div>
            <div className="detail-quote-number">{q.quote_number}</div>
            <h1 className="detail-title">{q.name || 'Untitled Quote'}</h1>
            <div className="detail-meta">
              {q.customer_name && <span>{q.customer_name}</span>}
              <span className={`status-badge status-${meta.color}`}>{meta.label}</span>
              <span>{q.term_months}mo term</span>
              {q.start_date && <span>{q.start_date} &rarr; {q.end_date || '...'}</span>}
              {q.header_discount > 0 && <span>{q.header_discount}% header discount</span>}
            </div>
          </div>
          <div className="detail-actions">
            {q.status === 'draft' && (
              <button className="btn-status btn-status-blue" onClick={() => changeStatus('submitted')}>
                <i className="fa-solid fa-paper-plane" /> Submit
              </button>
            )}
            {(q.status === 'draft' || q.status === 'submitted') && (
              <>
                <button className="btn-status btn-status-green" onClick={() => changeStatus('won')}>
                  <i className="fa-solid fa-check" /> Won
                </button>
                <button className="btn-status btn-status-red" onClick={() => changeStatus('lost')}>
                  <i className="fa-solid fa-xmark" /> Lost
                </button>
              </>
            )}
            {q.status !== 'cancelled' && q.status !== 'won' && q.status !== 'lost' && (
              <button className="btn-status btn-status-muted" onClick={() => changeStatus('cancelled')}>
                Cancel
              </button>
            )}
            <button className="btn-status btn-status-muted" onClick={() => generateQuotePdf(q)}>
              <i className="fa-solid fa-file-pdf" /> PDF
            </button>
            <button className="btn-status btn-status-muted" onClick={() => onDelete(q.id)}>
              <i className="fa-solid fa-trash-can" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-label">Monthly Total</div>
          <div className="summary-value">{fmtCurrency(totals.monthly)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Annual Total</div>
          <div className="summary-value">{fmtCurrency(totals.annual)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">TCV ({q.term_months}mo)</div>
          <div className="summary-value">{fmtCurrency(totals.tcv)}</div>
        </div>
      </div>

      {/* Line Editor */}
      <div className="line-editor-header">
        <div className="line-editor-title">Line Items</div>
        <div className="line-editor-actions">
          {showGroupInput ? (
            <div className="inline-group-add">
              <input
                className="field-input"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addGroup();
                  if (e.key === 'Escape') { setShowGroupInput(false); setGroupName(''); }
                }}
              />
              <button className="btn-save" onClick={addGroup} disabled={!groupName.trim()}>Add</button>
              <button className="btn-secondary" onClick={() => { setShowGroupInput(false); setGroupName(''); }}>Cancel</button>
            </div>
          ) : (
            <button className="btn-primary" onClick={() => setShowGroupInput(true)}>
              <i className="fa-solid fa-layer-group" /> New Group
            </button>
          )}
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
          {/* Ungrouped lines */}
          {ungrouped.length > 0 && (
            <table className="data-table line-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>List Price</th>
                  <th>Sales Price</th>
                  <th>Discount</th>
                  <th>Term</th>
                  <th>Monthly</th>
                  <th>Total</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {ungrouped.map(renderLineRow)}
              </tbody>
            </table>
          )}

          {/* Grouped lines */}
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
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>List Price</th>
                        <th>Sales Price</th>
                        <th>Discount</th>
                        <th>Term</th>
                        <th>Monthly</th>
                        <th>Total</th>
                        <th className="col-actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map(renderLineRow)}
                    </tbody>
                  </table>
                ) : (
                  <div className="line-group-empty">No lines in this group. Assign lines using the dropdown.</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quote Info */}
      {(q.comments || q.terms_conditions || q.prepared_by) && (
        <div className="quote-info-section">
          {q.prepared_by && (
            <div className="quote-info-row">
              <span className="quote-info-label">Prepared by</span>
              <span>{q.prepared_by}</span>
            </div>
          )}
          {q.comments && (
            <div className="quote-info-row">
              <span className="quote-info-label">Comments</span>
              <span>{q.comments}</span>
            </div>
          )}
          {q.terms_conditions && (
            <div className="quote-info-row">
              <span className="quote-info-label">Terms & Conditions</span>
              <span>{q.terms_conditions}</span>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showPicker && (
        <ProductPicker
          products={products}
          onAdd={addLine}
          onClose={() => setShowPicker(false)}
        />
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
