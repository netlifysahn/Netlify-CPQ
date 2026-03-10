import React, { useMemo, useState } from 'react';
import { TYPE_LABELS, UNIT_LABELS, fmtPrice, getProductCategory, isBundleProduct } from '../data/catalog';

export default function ProductPicker({ products, onAdd, onClose, multiSelect, existingProductIds }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selected, setSelected] = useState(new Set());

  const activeProducts = useMemo(() => (products || []).filter((p) => p.active && !p.hide), [products]);

  const categories = useMemo(() => {
    const counts = {};
    activeProducts.forEach((p) => {
      const cat = getProductCategory(p);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  }, [activeProducts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeProducts.filter((p) => {
      if (q) {
        return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      }
      if (activeCategory !== 'all') {
        return getProductCategory(p) === activeCategory;
      }
      return true;
    });
  }, [activeProducts, search, activeCategory]);

  const existing = existingProductIds || new Set();

  const toggleSelect = (productId) => {
    if (existing.has(productId)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      return next;
    });
  };

  const handleConfirm = () => {
    const productMap = new Map(activeProducts.map((p) => [p.id, p]));
    selected.forEach((id) => {
      const p = productMap.get(id);
      if (p) onAdd(p);
    });
    onClose();
  };

  // Simple single-select mode (used for sub-component picker)
  if (!multiSelect) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal picker-modal modal-theme-products" onClick={(e) => e.stopPropagation()}>
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
            {filtered.length === 0 && <div className="picker-empty">No matching products</div>}
            {filtered.map((p) => {
              const category = getProductCategory(p);
              return (
                <button key={p.id} className="picker-item" onClick={() => { onAdd(p); onClose(); }}>
                  <div className="picker-item-info">
                    <span className="picker-item-name">{p.name}</span>
                    <span className={`type-pill type-${category}`}>{TYPE_LABELS[category] || category}</span>
                  </div>
                  <div className="picker-item-meta">
                    <span className="picker-item-sku">{p.sku}</span>
                    <span className="picker-item-price">
                      {p.default_price?.amount > 0 ? fmtPrice(p.default_price.amount) + '/mo' : 'Custom'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Multi-select category picker
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal picker-modal-v2 modal-theme-quotes" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="picker-v2-header">
          <div className="picker-v2-title">Quote — Add Products</div>
          <div className="search-wrap picker-v2-search">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              autoFocus
            />
          </div>
        </div>

        {/* Body: sidebar + grid */}
        <div className="picker-v2-body">
          <div className="picker-v2-sidebar">
            <button
              className={`picker-v2-cat${activeCategory === 'all' && !search ? ' active' : ''}`}
              onClick={() => { setActiveCategory('all'); setSearch(''); }}
            >
              <span>All</span>
              <span className="picker-v2-cat-count">{activeProducts.length}</span>
            </button>
            {categories.map(([cat, count]) => (
              <button
                key={cat}
                className={`picker-v2-cat${activeCategory === cat && !search ? ' active' : ''}`}
                onClick={() => { setActiveCategory(cat); setSearch(''); }}
              >
                <span>{TYPE_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                <span className="picker-v2-cat-count">{count}</span>
              </button>
            ))}
          </div>

          <div className="picker-v2-grid-wrap">
            {filtered.length === 0 ? (
              <div className="picker-empty" style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center' }}>No matching products</div>
            ) : (
              <div className="picker-v2-grid">
                {filtered.map((p) => {
                  const category = getProductCategory(p);
                  const isExisting = existing.has(p.id);
                  const isSelected = selected.has(p.id);
                  const bundle = isBundleProduct(p);
                  const unit = UNIT_LABELS[p.default_price?.unit] || 'Flat';

                  return (
                    <div
                      key={p.id}
                      className={`picker-v2-card${isSelected ? ' selected' : ''}${isExisting ? ' existing' : ''}`}
                      onClick={() => toggleSelect(p.id)}
                    >
                      <div className="picker-v2-card-check">
                        {isExisting ? (
                          <i className="fa-solid fa-check" style={{ color: 'var(--text-faint)', fontSize: 12 }} />
                        ) : (
                          <div className={`picker-v2-checkbox${isSelected ? ' checked' : ''}`}>
                            {isSelected && <i className="fa-solid fa-check" />}
                          </div>
                        )}
                      </div>
                      <div className="picker-v2-card-name">
                        {p.name || p.sku || 'Unnamed Product'}
                        {bundle && <span className="pkg-badge">PKG</span>}
                      </div>
                      <div className="picker-v2-card-sku">{p.sku}</div>
                      <div className="picker-v2-card-bottom">
                        <span className="picker-v2-card-price">
                          {p.default_price?.amount > 0 ? fmtPrice(p.default_price.amount) + '/mo' : 'Custom'}
                        </span>
                        <span className={`type-pill type-${category}`}>{TYPE_LABELS[category] || category}</span>
                      </div>
                      {isExisting && <div className="picker-v2-card-existing">Already added</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="picker-v2-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={selected.size === 0}
            onClick={handleConfirm}
          >
            Add{selected.size > 0 ? ` ${selected.size} ` : ' '}Product{selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
