import React, { useState } from 'react';
import { S, CAT_COLORS } from '../styles/theme';
import { genId } from '../data/catalog';
import { ISearch } from './Icons';

const emptyBundle = () => ({
  id: genId(), name: '', sku: '', description: '', products: [], active: true,
});

export default function BundleModal({ bundle, products, onSave, onClose }) {
  const [f, setF] = useState(bundle || emptyBundle());
  const [q, setQ] = useState('');
  const s = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggle = (pid) =>
    setF((p) => ({
      ...p,
      products: p.products.includes(pid)
        ? p.products.filter((x) => x !== pid)
        : [...p.products, pid],
    }));

  const list = products.filter(
    (p) =>
      p.active &&
      (p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.sku.toLowerCase().includes(q.toLowerCase()))
  );
  const ok = f.name.trim() && f.sku.trim() && f.products.length > 0;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.mTitle}>{bundle ? 'Edit Bundle' : 'New Bundle'}</div>

        <div style={S.field}>
          <label style={S.label}>Bundle Name</label>
          <input style={S.input} value={f.name} onChange={(e) => s('name', e.target.value)} placeholder="e.g. Enterprise Starter Pack" />
        </div>

        <div style={S.r2}>
          <div style={S.field}>
            <label style={S.label}>SKU</label>
            <input style={S.input} value={f.sku} onChange={(e) => s('sku', e.target.value.toUpperCase())} placeholder="BDL-XXX" />
          </div>
          <div style={S.field}>
            <label style={S.label}>Status</label>
            <select style={S.select} value={f.active ? 'active' : 'inactive'} onChange={(e) => s('active', e.target.value === 'active')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div style={S.field}>
          <label style={S.label}>Description</label>
          <textarea style={S.textarea} value={f.description} onChange={(e) => s('description', e.target.value)} placeholder="What's included and why…" />
        </div>

        <div style={S.field}>
          <label style={S.label}>Products in Bundle ({f.products.length})</label>

          {f.products.length > 0 && (
            <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap' }}>
              {f.products.map((pid) => {
                const p = products.find((x) => x.id === pid);
                return p ? (
                  <span key={pid} style={S.chip}>
                    {p.name}
                    <span style={S.chipX} onClick={() => toggle(pid)}>×</span>
                  </span>
                ) : null;
              })}
            </div>
          )}

          <div style={{ ...S.searchWrap, marginBottom: 4 }}>
            <ISearch />
            <input style={S.searchIn} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" />
          </div>

          <div style={S.pickList}>
            {list.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>
                No active products match
              </div>
            )}
            {list.map((p) => (
              <div key={p.id} style={S.pickItem(f.products.includes(p.id))} onClick={() => toggle(p.id)}>
                <div>
                  <span style={{ fontWeight: 600, color: '#f0f2f5' }}>{p.name}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#4b5563', fontFamily: 'monospace' }}>{p.sku}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={S.badge(CAT_COLORS[p.category] || '#6b7280')}>{p.category}</span>
                  {f.products.includes(p.id) && <span style={{ color: '#00c7b7', fontWeight: 700 }}>✓</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={S.mActs}>
          <button style={S.canBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...S.saveBtn, opacity: ok ? 1 : 0.4 }}
            onClick={() => ok && onSave(f)}
            disabled={!ok}
          >
            Save Bundle
          </button>
        </div>
      </div>
    </div>
  );
}
