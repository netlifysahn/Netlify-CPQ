import React, { useState } from 'react';
import { fmtPrice } from '../data/catalog';

export default function ProductPicker({ products, onAdd, onClose }) {
  const [search, setSearch] = useState('');

  const filtered = products.filter((p) => {
    if (!p.active || p.hide) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Add Product</div>

        <div className="search-wrap" style={{ marginBottom: 16 }}>
          <i className="fa-solid fa-magnifying-glass" />
          <input
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            autoFocus
          />
        </div>

        <div className="picker-list">
          {filtered.length === 0 && (
            <div className="picker-empty">No matching products</div>
          )}
          {filtered.map((p) => (
            <button key={p.id} className="picker-item" onClick={() => { onAdd(p); onClose(); }}>
              <div className="picker-item-info">
                <span className="picker-item-name">{p.name}</span>
                <span className={`type-pill type-${p.type}`}>{p.type}</span>
              </div>
              <div className="picker-item-meta">
                <span className="picker-item-sku">{p.sku}</span>
                <span className="picker-item-price">
                  {p.default_price?.amount > 0 ? fmtPrice(p.default_price.amount) + '/mo' : 'Custom'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
