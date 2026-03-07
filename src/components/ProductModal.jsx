import React, { useState } from 'react';
import { PRODUCT_TYPES, PRICE_UNITS, PRICING_METHODS, TERM_BEHAVIORS, UNIT_LABELS, emptyProduct } from '../data/catalog';

function Section({ title, icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div className="section-header" onClick={() => setOpen(!open)}>
        <div className="section-title">
          <i className={`fa-solid ${icon}`} style={{ fontSize: 12 }} />
          {title}
        </div>
        <i className={`fa-solid fa-chevron-down section-toggle${open ? ' open' : ''}`} />
      </div>
      {open && children}
    </div>
  );
}

export default function ProductModal({ product, onSave, onClose }) {
  const [f, setF] = useState(product || emptyProduct());
  const [jsonError, setJsonError] = useState('');

  const s = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const sp = (k, v) => setF((p) => ({ ...p, default_price: { ...p.default_price, [k]: v } }));
  const sc = (k, v) => setF((p) => ({ ...p, config: { ...p.config, [k]: v } }));

  const ok = f.name.trim() && f.sku.trim();
  const validateJson = (val) => {
    s('default_entitlements', val);
    if (!val.trim() || val.trim() === '{}') {
      setJsonError('');
      return;
    }
    try {
      JSON.parse(val);
      setJsonError('');
    } catch (e) {
      setJsonError(e.message);
    }
  };

  const parsedEntitlements = (() => {
    try {
      const raw = typeof f.default_entitlements === 'string' ? f.default_entitlements : JSON.stringify(f.default_entitlements);
      return Object.entries(JSON.parse(raw) || {});
    } catch {
      return [];
    }
  })();

  const handleSave = () => {
    if (!ok) return;
    let entitlements = f.default_entitlements;
    try {
      if (typeof entitlements === 'string') JSON.parse(entitlements);
    } catch {
      entitlements = '{}';
    }
    onSave({
      ...f,
      default_price: { ...f.default_price, amount: parseFloat(f.default_price.amount) || 0 },
      default_entitlements: entitlements,
      config: {
        ...f.config,
        default_quantity: parseInt(f.config.default_quantity) || 1,
        min_quantity: parseInt(f.config.min_quantity) || 1,
        max_quantity: parseInt(f.config.max_quantity) || 999,
      },
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{product ? 'Edit Product' : 'New Product'}</div>

        {/* Basic Info */}
        <Section title="Basic Info" icon="fa-tag" defaultOpen={true}>
          <div className="field">
            <label className="field-label">Product Name</label>
            <input className="field-input" value={f.name} onChange={(e) => s('name', e.target.value)} placeholder="e.g. Netlify Enterprise" />
          </div>

          <div className="grid-2">
            <div className="field">
              <label className="field-label">SKU</label>
              <input className="field-input" value={f.sku} onChange={(e) => s('sku', e.target.value.toUpperCase())} placeholder="NTL-XXX" style={{ fontFamily: "'Menlo', monospace" }} />
            </div>
            <div className="field">
              <label className="field-label">Type</label>
              <select className="field-select" value={f.type} onChange={(e) => s('type', e.target.value)}>
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Description</label>
            <textarea className="field-textarea" value={f.description} onChange={(e) => s('description', e.target.value)} placeholder="Product description..." />
          </div>

          <div className="grid-2">
            <div className="checkbox-row">
              <input type="checkbox" checked={f.active} onChange={(e) => s('active', e.target.checked)} id="pActive" />
              <label htmlFor="pActive" className="checkbox-label">Active in catalog</label>
            </div>
            <div className="checkbox-row">
              <input type="checkbox" checked={f.hide} onChange={(e) => s('hide', e.target.checked)} id="pHide" />
              <label htmlFor="pHide" className="checkbox-label">Hide from quotes</label>
            </div>
          </div>
        </Section>

        {/* Pricing */}
        <Section title="Pricing" icon="fa-dollar-sign" defaultOpen={true}>
          <div className="grid-3">
            <div className="field">
              <label className="field-label">Monthly Price ($)</label>
              <input className="field-input" type="number" step="0.01" value={f.default_price.amount} onChange={(e) => sp('amount', e.target.value)} placeholder="0.00" />
            </div>
            <div className="field">
              <label className="field-label">Unit</label>
              <select className="field-select" value={f.default_price.unit} onChange={(e) => sp('unit', e.target.value)}>
                {PRICE_UNITS.map((u) => (
                  <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Method</label>
              <select className="field-select" value={f.default_price.pricing_method} onChange={(e) => sp('pricing_method', e.target.value)}>
                {PRICING_METHODS.map((m) => (
                  <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

        </Section>

        {/* Service */}
        <Section title="Service" icon="fa-gear" defaultOpen={false}>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">Default Term (months)</label>
              <input className="field-input" type="number" value={f.default_term} onChange={(e) => s('default_term', parseInt(e.target.value) || 0)} />
            </div>
            <div className="field">
              <label className="field-label">Term Behavior</label>
              <select className="field-select" value={f.term_behavior} onChange={(e) => s('term_behavior', e.target.value)}>
                {TERM_BEHAVIORS.map((b) => (
                  <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        {/* Entitlements */}
        <Section title="Entitlements" icon="fa-shield-halved" defaultOpen={false}>
          <div className="field">
            <label className="field-label">JSON</label>
            <textarea
              className={`field-textarea${jsonError ? ' json-invalid' : (f.default_entitlements && f.default_entitlements !== '{}' ? ' json-valid' : '')}`}
              value={typeof f.default_entitlements === 'string' ? f.default_entitlements : JSON.stringify(f.default_entitlements, null, 2)}
              onChange={(e) => validateJson(e.target.value)}
              placeholder='{"builds": 1000, "bandwidth_gb": 100}'
              style={{ fontFamily: "'Menlo', monospace", minHeight: 80 }}
            />
            {jsonError && <div className="json-error">{jsonError}</div>}
          </div>

          {parsedEntitlements.length > 0 && (
            <div className="entitlement-pills">
              {parsedEntitlements.map(([key, val]) => (
                <span key={key} className="entitlement-pill">
                  <span className="pill-key">{key}:</span> {String(val)}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* Configuration */}
        <Section title="Configuration" icon="fa-gear" defaultOpen={false}>
          <div className="grid-2">
            <div className="checkbox-row">
              <input type="checkbox" checked={f.config.lock_quantity} onChange={(e) => sc('lock_quantity', e.target.checked)} id="lockQty" />
              <label htmlFor="lockQty" className="checkbox-label">Lock quantity</label>
            </div>
            <div className="checkbox-row">
              <input type="checkbox" checked={f.config.lock_price} onChange={(e) => sc('lock_price', e.target.checked)} id="lockPrice" />
              <label htmlFor="lockPrice" className="checkbox-label">Lock price</label>
            </div>
            <div className="checkbox-row">
              <input type="checkbox" checked={f.config.lock_discount} onChange={(e) => sc('lock_discount', e.target.checked)} id="lockDisc" />
              <label htmlFor="lockDisc" className="checkbox-label">Lock discount</label>
            </div>
            <div className="checkbox-row">
              <input type="checkbox" checked={f.config.lock_term} onChange={(e) => sc('lock_term', e.target.checked)} id="lockTerm" />
              <label htmlFor="lockTerm" className="checkbox-label">Lock term</label>
            </div>
          </div>

          <div className="grid-3">
            <div className="field">
              <label className="field-label">Default Qty</label>
              <input className="field-input" type="number" value={f.config.default_quantity} onChange={(e) => sc('default_quantity', e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Min Qty</label>
              <input className="field-input" type="number" value={f.config.min_quantity} onChange={(e) => sc('min_quantity', e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Max Qty</label>
              <input className="field-input" type="number" value={f.config.max_quantity} onChange={(e) => sc('max_quantity', e.target.value)} />
            </div>
          </div>

          <div className="checkbox-row">
            <input type="checkbox" checked={f.config.edit_name} onChange={(e) => sc('edit_name', e.target.checked)} id="editName" />
            <label htmlFor="editName" className="checkbox-label">Allow editing product name on quote</label>
          </div>

          <div className="field">
            <label className="field-label">Default Description</label>
            <textarea className="field-textarea" value={f.config.default_description} onChange={(e) => sc('default_description', e.target.value)} placeholder="Default line item description..." />
          </div>
        </Section>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={handleSave} disabled={!ok}>
            Save Product
          </button>
        </div>
      </div>
    </div>
  );
}
