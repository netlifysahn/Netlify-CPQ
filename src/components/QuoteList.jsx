import React from 'react';
import { calcQuoteTotals, STATUS_META } from '../data/quotes';
import StatusBadge from './StatusBadge';

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

  const formatCurrency = (value) => {
    const numericValue = Number(value) || 0;
    return numericValue.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatTerm = (termMonths) => {
    const months = Number(termMonths) || 0;
    return `${months} month${months === 1 ? '' : 's'}`;
  };

  return (
    <div className="table-card quote-summary-card">
      <div className="quote-summary-table" role="table" aria-label="Quote Summary">
        <div className="quote-summary-row quote-summary-header" role="row">
          <div className="quote-summary-cell" role="columnheader">QUOTE</div>
          <div className="quote-summary-cell" role="columnheader">CUSTOMER</div>
          <div className="quote-summary-cell" role="columnheader">STATUS</div>
          <div className="quote-summary-cell quote-summary-money" role="columnheader">MRR</div>
          <div className="quote-summary-cell quote-summary-money" role="columnheader">ARR</div>
          <div className="quote-summary-cell" role="columnheader">TERM</div>
          <div className="quote-summary-cell" role="columnheader">ACTIONS</div>
        </div>
        <div className="quote-summary-body" role="rowgroup">
          {quotes.map((q) => {
            const totals = calcQuoteTotals(q);
            const meta = STATUS_META[q.status] || STATUS_META.draft;
            return (
              <div key={q.id} className="quote-summary-row quote-summary-data-row" role="row" onClick={() => onOpen(q)}>
                <div className="quote-summary-cell" role="cell">
                  <div className="quote-summary-name">{q.name || 'Untitled'}</div>
                  <div className="quote-summary-id">{q.quote_number || '\u2014'}</div>
                </div>
                <div className="quote-summary-cell quote-summary-customer" role="cell">
                  {q.customer_name || '\u2014'}
                </div>
                <div className="quote-summary-cell" role="cell">
                  <StatusBadge label={meta.label} tone={meta.color} />
                </div>
                <div className="quote-summary-cell quote-summary-money quote-summary-money-value" role="cell">
                  {formatCurrency(totals.monthly)}
                </div>
                <div className="quote-summary-cell quote-summary-money quote-summary-money-value" role="cell">
                  {formatCurrency(totals.annual)}
                </div>
                <div className="quote-summary-cell quote-summary-term" role="cell">
                  {formatTerm(q.term_months)}
                </div>
                <div className="quote-summary-cell cell-actions" role="cell" onClick={(e) => e.stopPropagation()}>
                  <button className="row-action-btn" title="Clone" onClick={() => onDupe(q)}>
                    <i className="fa-solid fa-clone fa-fw" />
                  </button>
                  <button className="row-action-btn row-action-btn--danger" title="Delete" onClick={() => onDelete(q.id)}>
                    <i className="fa-solid fa-trash fa-fw" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
