import React from 'react';
import { fmtCurrency, calcQuoteTotals, STATUS_META } from '../data/quotes';

export default function QuoteList({ quotes, onNew, onOpen, onDupe, onDelete }) {
  if (quotes.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-numeral">0</div>
        <div className="empty-state-eyebrow">Quotes</div>
        <div className="empty-state-title">No quotes yet</div>
        <div className="empty-state-text">Create your first quote to get started</div>
        {onNew && (
          <button className="empty-state-cta" onClick={onNew}>
            New Quote
          </button>
        )}
      </div>
    );
  }

  const QUOTE_STATUS_COLORS = {
    draft: '#6b7280',
    sent: '#2E51ED',
    draft_revision: '#FBB13D',
    ready_to_submit: '#05BDBA',
    pending_approval: '#7C3AED',
    approved: '#059669',
    rejected: '#ef4444',
    converted: '#065f46',
    archived: '#9ca3af',
  };

  return (
    <div className="table-card">
      <table className="data-table data-table-quotes">
        <thead>
          <tr>
            <th>Quote</th>
            <th>Customer</th>
            <th>ACV</th>
            <th>TCV</th>
            <th>Term</th>
            <th>Status</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => {
            const totals = calcQuoteTotals(q);
            const meta = STATUS_META[q.status] || STATUS_META.draft;
            const dotColor = QUOTE_STATUS_COLORS[q.status] || '#6b7280';
            return (
              <tr key={q.id} className="clickable-row" onClick={() => onOpen(q)}>
                <td>
                  <div className="cell-name">{q.name || 'Untitled'}</div>
                  <div className="cell-quote-number">{q.quote_number}</div>
                </td>
                <td>
                  <span className="cell-customer">{q.customer_name || '\u2014'}</span>
                </td>
                <td>
                  <span className="cell-amount">{totals.monthly > 0 ? fmtCurrency(totals.monthly * 12) : '\u2014'}</span>
                </td>
                <td>
                  <span className="cell-amount">{totals.tcv > 0 ? fmtCurrency(totals.tcv) : '\u2014'}</span>
                </td>
                <td>
                  <span className="cell-term">{q.term_months} month</span>
                </td>
                <td>
                  <div className="cell-status">
                    <span className="status-dot" style={{ background: dotColor }} />
                    <span className="status-label">{meta.label}</span>
                  </div>
                </td>
                <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                  <div className="actions-group">
                    <button className="action-btn edit" title="Edit" aria-label="Edit" onClick={() => onOpen(q)}>
                      <i className="fa-solid fa-pen-to-square fa-fw fa-sm" aria-hidden="true" />
                    </button>
                    <button className="action-btn duplicate" title="Clone" aria-label="Clone" onClick={() => onDupe(q)}>
                      <i className="fa-solid fa-clone fa-fw fa-sm" aria-hidden="true" />
                    </button>
                    <button className="action-btn delete" title="Delete" aria-label="Delete" onClick={() => onDelete(q.id)}>
                      <i className="fa-solid fa-trash fa-fw fa-sm" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
