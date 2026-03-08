import React, { useState } from 'react';
import { TERM_OPTIONS, calcEndDate, emptyQuote } from '../data/quotes';

export default function QuoteModal({ quote, existingQuotes, onSave, onClose }) {
  const [f, setF] = useState(quote || emptyQuote(existingQuotes));

  const s = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const ok = f.name.trim();

  const handleTermChange = (term) => {
    const t = parseInt(term);
    setF((p) => ({
      ...p,
      term_months: t,
      end_date: calcEndDate(p.start_date, t),
    }));
  };

  const handleStartChange = (date) => {
    setF((p) => ({
      ...p,
      start_date: date,
      end_date: calcEndDate(date, p.term_months),
    }));
  };

  const handleSave = () => {
    if (!ok) return;
    onSave({
      ...f,
      header_discount: parseFloat(f.header_discount) || 0,
      end_date: calcEndDate(f.start_date, f.term_months),
      updated_at: new Date().toISOString(),
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{quote ? 'Edit Quote' : 'New Quote'}</div>

        <div className="field">
          <label className="field-label">Quote Name</label>
          <input className="field-input" value={f.name} onChange={(e) => s('name', e.target.value)} placeholder="e.g. Riot Games — Enterprise Renewal" />
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="field-label">Customer Name</label>
            <input className="field-input" value={f.customer_name} onChange={(e) => s('customer_name', e.target.value)} placeholder="Company name" />
          </div>
          <div className="field">
            <label className="field-label">Customer Contact</label>
            <input className="field-input" value={f.customer_contact} onChange={(e) => s('customer_contact', e.target.value)} placeholder="Contact name or email" />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Prepared By</label>
          <input className="field-input" value={f.prepared_by} onChange={(e) => s('prepared_by', e.target.value)} placeholder="Your name" />
        </div>

        <div className="grid-3">
          <div className="field">
            <label className="field-label">Term</label>
            <select className="field-select" value={f.term_months} onChange={(e) => handleTermChange(e.target.value)}>
              {TERM_OPTIONS.map((t) => (
                <option key={t} value={t}>{t} months</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Start Date</label>
            <input className="field-input" type="date" value={f.start_date} onChange={(e) => handleStartChange(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">End Date</label>
            <input className="field-input" type="date" value={f.end_date || calcEndDate(f.start_date, f.term_months)} disabled />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Header Discount %</label>
          <input className="field-input" type="number" step="0.1" min="0" max="100" value={f.header_discount} onChange={(e) => s('header_discount', e.target.value)} placeholder="0" />
        </div>

        <div className="field">
          <label className="field-label">Comments</label>
          <textarea className="field-textarea" value={f.comments} onChange={(e) => s('comments', e.target.value)} placeholder="Internal notes..." />
        </div>

        <div className="field">
          <label className="field-label">Terms & Conditions</label>
          <textarea className="field-textarea" value={f.terms_conditions} onChange={(e) => s('terms_conditions', e.target.value)} placeholder="Payment terms, legal notes..." />
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={handleSave} disabled={!ok}>
            {quote ? 'Save Changes' : 'Create Quote'}
          </button>
        </div>
      </div>
    </div>
  );
}
