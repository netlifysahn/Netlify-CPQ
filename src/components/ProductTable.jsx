import React from 'react';
import { S, CAT_COLORS, fmtPrice } from '../styles/theme';
import { IEdit, ITrash, IDupe } from './Icons';

export default function ProductTable({ products, onEdit, onDupe, onDelete }) {
  if (products.length === 0) {
    return (
      <div style={S.empty}>
        <div style={{ fontSize: 38, opacity: 0.4, marginBottom: 12 }}>📦</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#8b95a5', marginBottom: 6 }}>No products found</div>
        <div style={{ fontSize: 13 }}>Add your first product to get started</div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Product</th>
            <th style={S.th}>Category</th>
            <th style={S.th}>Pricing</th>
            <th style={S.th}>Price</th>
            <th style={S.th}>Status</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr
              key={p.id}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.02)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <td style={S.td}>
                <div style={S.name}>{p.name}</div>
                <div style={S.sku}>{p.sku}</div>
                {p.notes && <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>{p.notes}</div>}
              </td>
              <td style={S.td}>
                <span style={S.badge(CAT_COLORS[p.category] || '#6b7280')}>{p.category}</span>
              </td>
              <td style={S.td}>
                <span style={{ fontSize: 12, color: '#8b95a5' }}>{p.pricingModel}</span>
              </td>
              <td style={S.td}>
                <span style={S.pP}>{fmtPrice(p.price)}</span>
                {p.unit && <span style={S.pU}> {p.unit}</span>}
              </td>
              <td style={S.td}>
                <span style={S.dot(p.active)} />
                <span style={{ fontSize: 12 }}>{p.active ? 'Active' : 'Inactive'}</span>
              </td>
              <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button style={S.aBtn} title="Edit" onClick={() => onEdit(p)}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#00c7b7')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#4b5563')}><IEdit /></button>
                <button style={S.aBtn} title="Duplicate" onClick={() => onDupe(p)}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#3b82f6')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#4b5563')}><IDupe /></button>
                <button style={S.aBtn} title="Delete" onClick={() => onDelete(p.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#4b5563')}><ITrash /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
