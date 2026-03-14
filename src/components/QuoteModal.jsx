import React, { useState } from 'react';
import {
  TERM_OPTIONS, BILLING_SCHEDULES, PAYMENT_METHODS, PAYMENT_TERMS,
  calcEndDate, emptyQuote,
} from '../data/quotes';

const SECTIONS = {
  CUSTOMER: 'customer',
  TERM: 'term',
  BILLING: 'billing',
  INTERNAL: 'internal',
};

export default function QuoteModal({ quote, existingQuotes, pricebooks, onSave, onClose }) {
  const activePricebooks = (pricebooks || []).filter((pb) => pb.active);
  const defaultPb = activePricebooks.find((pb) => pb.is_default);
  const initialQuote = quote || emptyQuote(existingQuotes);
  if (!quote && !initialQuote.pricebook_id && defaultPb) {
    initialQuote.pricebook_id = defaultPb.id;
  }

  const [f, setF] = useState(initialQuote);
  const [openSections, setOpenSections] = useState({
    [SECTIONS.CUSTOMER]: true,
    [SECTIONS.TERM]: true,
    [SECTIONS.BILLING]: true,
    [SECTIONS.INTERNAL]: false,
  });

  const s = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const ok = f.name.trim();

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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

        <div className="grid-2">
          <div className="field">
            <label className="field-label">Quote Type</label>
            <select className="field-select" value={f.quote_type || 'net_new'} onChange={(e) => s('quote_type', e.target.value)}>
              <option value="net_new">Net New</option>
              <option value="renewal">Renewal</option>
              <option value="expansion">Expansion</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Prepared By</label>
            <input className="field-input" value={f.prepared_by} onChange={(e) => s('prepared_by', e.target.value)} placeholder="Your name" />
          </div>
        </div>

        {/* ── Customer Information ── */}
        <div className="modal-section">
          <button type="button" className="modal-section-label modal-section-toggle" onClick={() => toggleSection(SECTIONS.CUSTOMER)} aria-expanded={openSections[SECTIONS.CUSTOMER]}>
            <span>Customer Information</span>
            <span>{openSections[SECTIONS.CUSTOMER] ? '▾' : '▸'}</span>
          </button>
          <div className={`modal-section-content ${openSections[SECTIONS.CUSTOMER] ? 'is-open' : ''}`}>
            <div className="field">
              <label className="field-label">Customer Name</label>
              <input className="field-input" value={f.customer_name} onChange={(e) => s('customer_name', e.target.value)} placeholder="Company name" />
            </div>
            <div className="grid-2">
              <div className="field">
                <label className="field-label">Primary Contact Name</label>
                <input className="field-input" value={f.contact_name} onChange={(e) => s('contact_name', e.target.value)} placeholder="Full name" />
              </div>
              <div className="field">
                <label className="field-label">Primary Contact Email</label>
                <input className="field-input" type="email" value={f.contact_email} onChange={(e) => s('contact_email', e.target.value)} placeholder="contact@company.com" />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Address</label>
              <input className="field-input" value={f.address} onChange={(e) => s('address', e.target.value)} placeholder="Street, City, State, ZIP, Country" />
            </div>
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
              <label className="field-label">Invoice Email</label>
              <input className="field-input" type="email" value={f.invoice_email} onChange={(e) => s('invoice_email', e.target.value)} placeholder="invoices@company.com" />
            </div>
          </div>
        </div>

        {/* ── Subscription Term ── */}
        <div className="modal-section">
          <button type="button" className="modal-section-label modal-section-toggle" onClick={() => toggleSection(SECTIONS.TERM)} aria-expanded={openSections[SECTIONS.TERM]}>
            <span>Subscription Term</span>
            <span>{openSections[SECTIONS.TERM] ? '▾' : '▸'}</span>
          </button>
          <div className={`modal-section-content ${openSections[SECTIONS.TERM] ? 'is-open' : ''}`}>
            <div className="grid-2">
              <div className="field">
                <label className="field-label">Quote Expiration Date</label>
                <input className="field-input" type="date" value={f.expiration_date} onChange={(e) => s('expiration_date', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Order Form Effective Date</label>
                <input className="field-input" type="date" value={f.effective_date} onChange={(e) => s('effective_date', e.target.value)} />
              </div>
            </div>
            <div className="grid-3">
              <div className="field">
                <label className="field-label">Subscription Start Date</label>
                <input className="field-input" type="date" value={f.start_date} onChange={(e) => handleStartChange(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Subscription Term</label>
                <select className="field-select" value={f.term_months} onChange={(e) => handleTermChange(e.target.value)}>
                  {TERM_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t} months</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label">End Date</label>
                <input className="field-input" type="date" value={f.end_date || calcEndDate(f.start_date, f.term_months)} disabled />
              </div>
            </div>
          </div>
        </div>

        {/* ── Billing & Payment ── */}
        <div className="modal-section">
          <button type="button" className="modal-section-label modal-section-toggle" onClick={() => toggleSection(SECTIONS.BILLING)} aria-expanded={openSections[SECTIONS.BILLING]}>
            <span>Billing &amp; Payment</span>
            <span>{openSections[SECTIONS.BILLING] ? '▾' : '▸'}</span>
          </button>
          <div className={`modal-section-content ${openSections[SECTIONS.BILLING] ? 'is-open' : ''}`}>
            <div className="grid-3">
              <div className="field">
                <label className="field-label">Billing Schedule</label>
                <select className="field-select" value={f.billing_schedule} onChange={(e) => s('billing_schedule', e.target.value)}>
                  {BILLING_SCHEDULES.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Payment Method</label>
                <select className="field-select" value={f.payment_method} onChange={(e) => s('payment_method', e.target.value)}>
                  <option value="">Select...</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Payment Terms</label>
                <select className="field-select" value={f.payment_terms || 'Net 30'} onChange={(e) => s('payment_terms', e.target.value)}>
                  {PAYMENT_TERMS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label className="field-label">PO #</label>
                <input className="field-input" value={f.po_number} onChange={(e) => s('po_number', e.target.value)} placeholder="Optional" />
              </div>
              <div className="field">
                <label className="field-label">VAT #</label>
                <input className="field-input" value={f.vat_number} onChange={(e) => s('vat_number', e.target.value)} placeholder="Optional" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Internal (collapsed by default) ── */}
        <div className="modal-section">
          <button type="button" className="modal-section-label modal-section-toggle" onClick={() => toggleSection(SECTIONS.INTERNAL)} aria-expanded={openSections[SECTIONS.INTERNAL]}>
            <span>Internal</span>
            <span>{openSections[SECTIONS.INTERNAL] ? '▾' : '▸'}</span>
          </button>
          <div className={`modal-section-content ${openSections[SECTIONS.INTERNAL] ? 'is-open' : ''}`}>
            <div className="grid-2">
              <div className="field">
                <label className="field-label">Partner Name</label>
                <input className="field-input" value={f.partner_name || ''} onChange={(e) => s('partner_name', e.target.value)} placeholder="e.g. Sitecore, Storyblok (leave blank if direct)" />
              </div>
              <div className="field">
                <label className="field-label">Netlify Account ID</label>
                <input className="field-input" value={f.account_id} onChange={(e) => s('account_id', e.target.value)} placeholder="e.g. acct_abc123" style={{ fontFamily: "'Menlo', monospace" }} />
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
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={handleSave} disabled={!ok}>
            {quote ? 'Save Changes' : 'Create Quote'}
          </button>
        </div>
      </div>
    </div>
  );
}
