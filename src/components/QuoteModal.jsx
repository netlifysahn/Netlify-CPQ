import React, { useState } from 'react';
import { TERM_OPTIONS, calcEndDate, emptyQuote } from '../data/quotes';

export default function QuoteModal({ quote, existingQuotes, pricebooks, onSave, onClose }) {
  const activePricebooks = (pricebooks || []).filter((pb) => pb.active);
  const defaultPb = activePricebooks.find((pb) => pb.is_default);
  const initialQuote = quote || emptyQuote(existingQuotes);
  if (!quote && !initialQuote.pricebook_id && defaultPb) {
    initialQuote.pricebook_id = defaultPb.id;
  }
  const [f, setF] = useState(initialQuote);

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
      <div className="modal modal-theme-quotes" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{quote ? 'Edit Quote' : 'New Quote'}</div>

        <div className="field">
          <label className="field-label">Quote Name</label>
          <input className="field-input" value={f.name} onChange={(e) => s('name', e.target.value)} placeholder="e.g. Riot Games — Enterprise Renewal" />
        </div>

        <div className="modal-section">
          <div className="modal-section-label"><i className="fa-solid fa-building" /> Customer Information</div>
          <div className="field">
            <label className="field-label">Company Name</label>
            <input className="field-input" value={f.customer_name} onChange={(e) => s('customer_name', e.target.value)} placeholder="Company name" />
          </div>
          <div className="field">
            <label className="field-label">Company Address</label>
            <textarea className="field-textarea" value={f.customer_address} onChange={(e) => s('customer_address', e.target.value)} placeholder="Street, City, State, ZIP, Country" />
          </div>
        </div>

        <div className="modal-section">
          <div className="modal-section-label"><i className="fa-solid fa-file-invoice" /> Billing Contact</div>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">Billing Contact Name</label>
              <input className="field-input" value={f.billing_contact_name} onChange={(e) => s('billing_contact_name', e.target.value)} placeholder="Full name" />
            </div>
            <div className="field">
              <label className="field-label">Billing Contact Email</label>
              <input className="field-input" type="email" value={f.billing_contact_email} onChange={(e) => s('billing_contact_email', e.target.value)} placeholder="billing@company.com" />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Billing Contact Phone</label>
            <input className="field-input" value={f.billing_contact_phone} onChange={(e) => s('billing_contact_phone', e.target.value)} placeholder="+1 (555) 000-0000" />
          </div>
        </div>

        <div className="modal-section">
          <div className="modal-section-label"><i className="fa-solid fa-user" /> Internal</div>
          <div className="field">
            <label className="field-label">Prepared By</label>
            <input className="field-input" value={f.prepared_by} onChange={(e) => s('prepared_by', e.target.value)} placeholder="Your name" />
          </div>
          <div className="field">
            <label className="field-label">Customer Contact (legacy)</label>
            <input className="field-input" value={f.customer_contact} onChange={(e) => s('customer_contact', e.target.value)} placeholder="Contact name or email" />
          </div>
        </div>

        {activePricebooks.length > 0 && (
          <div className="field">
            <label className="field-label">Pricebook</label>
            <select className="field-select" value={f.pricebook_id || ''} onChange={(e) => s('pricebook_id', e.target.value || null)}>
              <option value="">No pricebook</option>
              {activePricebooks.map((pb) => (
                <option key={pb.id} value={pb.id}>{pb.name}{pb.is_default ? ' (Default)' : ''}</option>
              ))}
            </select>
          </div>
        )}

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
