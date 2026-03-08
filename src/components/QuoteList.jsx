import React from 'react';
import { fmtCurrency, calcQuoteTotals, STATUS_META } from '../data/quotes';

export default function QuoteList({ quotes, onNew, onOpen, onDupe, onDelete }) {
  if (quotes.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon"><i className="fa-solid fa-file-invoice-dollar" /></div>
        <div className="empty-state-title">No quotes yet</div>
        <div className="empty-state-text">Create your first quote to get started</div>
        {onNew && (
          <button className="empty-state-cta" onClick={onNew}>
            <i className="fa-solid fa-plus" /> New Quote
          </button>
        )}
      </div>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Quote #</th>
          <th>Name</th>
          <th>Customer</th>
          <th>Monthly</th>
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
          return (
            <tr key={q.id} className="clickable-row" onClick={() => onOpen(q)}>
              <td>
                <span className="cell-quote-number">{q.quote_number}</span>
              </td>
              <td>
                <div className="cell-name">{q.name || 'Untitled'}</div>
              </td>
              <td>
                <span className="cell-customer">{q.customer_name || '\u2014'}</span>
              </td>
              <td>
                <span className="price-monthly">{totals.monthly > 0 ? fmtCurrency(totals.monthly) : '\u2014'}</span>
              </td>
              <td>
                <span className="price-monthly">{totals.tcv > 0 ? fmtCurrency(totals.tcv) : '\u2014'}</span>
              </td>
              <td>
                <span className="cell-term">{q.term_months}mo</span>
              </td>
              <td>
                <span className={`status-badge status-${meta.color}`}>{meta.label}</span>
              </td>
              <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                <div className="actions-group">
                  <button className="action-btn edit" title="Edit" onClick={() => onOpen(q)}>
                    <i className="fa-solid fa-pen-to-square" />
                  </button>
                  <button className="action-btn duplicate" title="Clone" onClick={() => onDupe(q)}>
                    <i className="fa-solid fa-copy" />
                  </button>
                  <button className="action-btn delete" title="Delete" onClick={() => onDelete(q.id)}>
                    <i className="fa-solid fa-trash-can" />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
