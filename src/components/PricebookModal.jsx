import React, { useState } from 'react';
import { emptyPricebook } from '../data/pricebooks';

function coercePricebook(pricebook) {
  const next = { ...(pricebook || emptyPricebook()) };
  if (!next.currency) next.currency = 'USD';
  if (!Array.isArray(next.entries)) next.entries = [];
  if (!Array.isArray(next.tiered_pricing)) next.tiered_pricing = [];
  return next;
}

export default function PricebookModal({ pricebook, onSave, onClose }) {
  const [form, setForm] = useState(coercePricebook(pricebook));

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const canSave = form.name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;

    onSave({
      ...form,
      name: form.name.trim(),
      description: form.description.trim(),
      currency: form.currency.trim().toUpperCase() || 'USD',
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal pricebook-modal modal-theme-products" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">{pricebook ? 'Edit Pricebook' : 'Create Pricebook'}</div>

        <div className="field">
          <label className="field-label">Name</label>
          <input
            className="field-input"
            value={form.name}
            onChange={(event) => setField('name', event.target.value)}
            placeholder="e.g. FY26 Enterprise"
          />
        </div>

        <div className="field">
          <label className="field-label">Description</label>
          <textarea
            className="field-textarea"
            value={form.description}
            onChange={(event) => setField('description', event.target.value)}
            placeholder="Optional context for this pricebook"
          />
        </div>

        <div className="field">
          <label className="field-label">Currency</label>
          <input
            className="field-input"
            value={form.currency}
            onChange={(event) => setField('currency', event.target.value)}
            placeholder="USD"
          />
        </div>

        <div className="checkbox-row">
          <input
            type="checkbox"
            id="pricebookActive"
            checked={form.active}
            onChange={(event) => setField('active', event.target.checked)}
          />
          <label htmlFor="pricebookActive" className="checkbox-label">Active</label>
        </div>

        <div className="checkbox-row">
          <input
            type="checkbox"
            id="pricebookDefault"
            checked={form.is_default}
            onChange={(event) => setField('is_default', event.target.checked)}
          />
          <label htmlFor="pricebookDefault" className="checkbox-label">Default</label>
        </div>

        <div className="pricebook-modal-note">Only one pricebook can be marked as default.</div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={handleSave} disabled={!canSave}>
            Save Pricebook
          </button>
        </div>
      </div>
    </div>
  );
}
