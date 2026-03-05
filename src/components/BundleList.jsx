import React from 'react';
import { S, CAT_COLORS, fmtPrice } from '../styles/theme';
import { IEdit, ITrash, IBundle } from './Icons';

export default function BundleList({ bundles, products, onEdit, onDelete }) {
  if (bundles.length === 0) {
    return (
      <div style={S.empty}>
        <div style={{ fontSize: 38, opacity: 0.4, marginBottom: 12 }}>📦</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#8b95a5', marginBottom: 6 }}>No bundles yet</div>
        <div style={{ fontSize: 13 }}>Create a bundle to package products together for quoting</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {bundles.map((b) => {
        const bp = b.products.map((pid) => products.find((x) => x.id === pid)).filter(Boolean);
        const tot = bp.reduce((sum, p) => sum + (p.price || 0), 0);
        return (
          <div key={b.id} style={{ background: '#111827', border: '1px solid #1e2636', borderRadius: 10, padding: '18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IBundle />
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#f0f2f5' }}>{b.name}</span>
                  <span style={{ fontSize: 11, color: '#4b5563', fontFamily: 'monospace' }}>{b.sku}</span>
                  <span style={S.dot(b.active)} />
                </div>
                {b.description && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{b.description}</div>}
              </div>
              <div style={{ display: 'flex', gap: 2 }}>
                <button style={S.aBtn} title="Edit" onClick={() => onEdit(b)}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#00c7b7')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#4b5563')}><IEdit /></button>
                <button style={S.aBtn} title="Delete" onClick={() => onDelete(b.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#4b5563')}><ITrash /></button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {bp.map((p) => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', background: 'rgba(255,255,255,.03)',
                  borderRadius: 6, border: '1px solid #1e2636', fontSize: 12,
                }}>
                  <span style={S.badge(CAT_COLORS[p.category] || '#6b7280')}>{p.category}</span>
                  <span style={{ color: '#c8cdd7', fontWeight: 500 }}>{p.name}</span>
                  <span style={{ color: '#4b5563' }}>·</span>
                  <span style={{ color: '#8b95a5' }}>{fmtPrice(p.price)}{p.unit && ` ${p.unit}`}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #1e2636', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{bp.length} product{bp.length !== 1 ? 's' : ''}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#00c7b7' }}>List: {tot > 0 ? fmtPrice(tot) : 'Custom'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
