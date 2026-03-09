import React, { useMemo, useState } from 'react';
import { getPricebookStatus } from '../data/pricebooks';
import { fmtPrice } from '../data/catalog';
import ProductPicker from './ProductPicker';

export default function PricebookDetail({ pricebook, products, onBack, onUpdate }) {
  const [showPicker, setShowPicker] = useState(false);

  const productMap = useMemo(() => new Map((products || []).map((product) => [product.id, product])), [products]);
  const entries = Array.isArray(pricebook?.entries) ? pricebook.entries : [];

  const getEffectivePrice = (entry) => {
    if (entry.price_override != null) return entry.price_override;
    const product = productMap.get(entry.product_id);
    return product?.default_price?.amount || 0;
  };

  const addProduct = (product) => {
    if (entries.some((e) => e.product_id === product.id)) return;
    onUpdate({
      ...pricebook,
      entries: [...entries, { product_id: product.id, price_override: null }],
      updated_at: new Date().toISOString(),
    });
  };

  const removeEntry = (productId) => {
    onUpdate({
      ...pricebook,
      entries: entries.filter((e) => e.product_id !== productId),
      updated_at: new Date().toISOString(),
    });
  };

  const updateOverride = (productId, value) => {
    const parsed = value === '' ? null : parseFloat(value);
    const override = parsed != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    onUpdate({
      ...pricebook,
      entries: entries.map((e) =>
        e.product_id === productId ? { ...e, price_override: override } : e
      ),
      updated_at: new Date().toISOString(),
    });
  };

  return (
    <div className="pricebook-detail">
      <button className="btn-secondary back-btn" onClick={onBack}>
        <i className="fa-solid fa-chevron-left" />
        Back to Pricebooks
      </button>

      <div className="page-header">
        <div className="page-label">Pricebook</div>
        <h1 className="page-title">{pricebook.name}</h1>
        <span className={`status-badge status-badge-inline${pricebook.active ? ' active' : ''}`}>{getPricebookStatus(pricebook)}</span>
      </div>

      <div className="detail-section">
        <div className="line-editor-header">
          <div className="line-editor-title">Products ({entries.length})</div>
          <div className="line-editor-actions">
            <button className="btn-primary" onClick={() => setShowPicker(true)}>
              Add Product
            </button>
          </div>
        </div>

        {entries.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-numeral">0</div>
            <div className="empty-state-eyebrow">Products</div>
            <div className="empty-state-title">No products in this pricebook</div>
            <div className="empty-state-text">Add products to define pricing for this pricebook</div>
            <button className="empty-state-cta" onClick={() => setShowPicker(true)}>
              Add Product
            </button>
          </div>
        )}

        {entries.length > 0 && (
          <div className="table-card">
            <table className="data-table data-table-pricebooks">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Base Price</th>
                  <th>Override Price</th>
                  <th>Effective Price</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const product = productMap.get(entry.product_id);
                  const basePrice = product?.default_price?.amount || 0;
                  const effective = getEffectivePrice(entry);
                  return (
                    <tr key={entry.product_id}>
                      <td>
                        <div className="cell-name">{product?.name || 'Unknown Product'}</div>
                      </td>
                      <td><span className="cell-sku">{product?.sku || '—'}</span></td>
                      <td><span className="price-monthly">{basePrice > 0 ? fmtPrice(basePrice) + '/mo' : '—'}</span></td>
                      <td>
                        <input
                          className="inline-edit"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Inherit"
                          value={entry.price_override != null ? entry.price_override : ''}
                          onChange={(e) => updateOverride(entry.product_id, e.target.value)}
                        />
                      </td>
                      <td>
                        <span className="price-monthly">{effective > 0 ? fmtPrice(effective) + '/mo' : '—'}</span>
                      </td>
                      <td className="col-actions">
                        <div className="actions-group">
                          <button className="action-btn delete" title="Remove" onClick={() => removeEntry(entry.product_id)}>
                            <i className="fa-solid fa-trash-can" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showPicker && (
        <ProductPicker
          products={products.filter((p) => !entries.some((e) => e.product_id === p.id))}
          onAdd={addProduct}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
