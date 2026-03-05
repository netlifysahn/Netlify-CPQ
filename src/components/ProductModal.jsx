import React, { useState } from 'react';
import { S } from '../styles/theme';
import { CATEGORIES, PRICING_MODELS, genId } from '../data/catalog';

const emptyProd = () => ({
  id: genId(), name: '', sku: '', category: 'Platform',
  pricingModel: 'Flat Rate', price: '', unit: '', active: true, notes: '',
});

export default function ProductModal({ product, onSave, onClose }) {
  const [f, setF] = useState(product || emptyProd());
  const s = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const ok = f.name.trim() && f.sku.trim();

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.mTitle}>{product ? 'Edit Product' : 'New Product'}</div>

        <div style={S.field}>
          <label style={S.label}>Product Name</label>
          <input style={S.input} value={f.name} onChange={(e) => s('name', e.target.value)} placeholder="e.g. Netlify Enterprise" />
        </div>

        <div style={S.r2}>
          <div style={S.field}>
            <label style={S.label}>SKU</label>
            <input style={S.input} value={f.sku} onChange={(e) => s('sku', e.target.value.toUpperCase())} placeholder="NTL-XXX" />
          </div>
          <div style={S.field}>
            <label style={S.label}>Category</label>
            <select style={S.select} value={f.category} onChange={(e) => s('category', e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div style={S.r3}>
          <div style={S.field}>
            <label style={S.label}>Pricing Model</label>
            <select style={S.select} value={f.pricingModel} onChange={(e) => s('pricingModel', e.target.value)}>
              {PRICING_MODELS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div style={S.field}>
            <label style={S.label}>Price ($)</label>
            <input style={S.input} type="number" step="0.01" value={f.price} onChange={(e) => s('price', e.target.value)} placeholder="0.00" />
          </div>
          <div style={S.field}>
            <label style={S.label}>Unit</label>
            <input style={S.input} value={f.unit} onChange={(e) => s('unit', e.target.value)} placeholder="/mo, /GB…" />
          </div>
        </div>

        <div style={S.field}>
          <label style={S.label}>Notes</label>
          <textarea style={S.textarea} value={f.notes} onChange={(e) => s('notes', e.target.value)} placeholder="Internal notes, tier details…" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={f.active} onChange={(e) => s('active', e.target.checked)} id="pActive" />
          <label htmlFor="pActive" style={{ fontSize: 13, color: '#8b95a5', cursor: 'pointer' }}>Active in catalog</label>
        </div>

        <div style={S.mActs}>
          <button style={S.canBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...S.saveBtn, opacity: ok ? 1 : 0.4 }}
            onClick={() => ok && onSave({ ...f, price: parseFloat(f.price) || 0 })}
            disabled={!ok}
          >
            Save Product
          </button>
        </div>
      </div>
    </div>
  );
}
