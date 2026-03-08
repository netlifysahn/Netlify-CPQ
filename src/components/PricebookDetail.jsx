import React, { useMemo, useState } from 'react';
import { PRICEBOOK_TABS, getPricebookStatus } from '../data/pricebooks';

export default function PricebookDetail({ pricebook, products, onBack }) {
  const [tab, setTab] = useState('entries');

  const productMap = useMemo(() => new Map((products || []).map((product) => [product.id, product])), [products]);
  const entries = Array.isArray(pricebook?.entries) ? pricebook.entries : [];
  const tiers = Array.isArray(pricebook?.tiered_pricing) ? pricebook.tiered_pricing : [];

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

      <div className="tabs-row">
        {PRICEBOOK_TABS.map((item) => (
          <button key={item.key} className={`tab-btn${tab === item.key ? ' active' : ''}`} onClick={() => setTab(item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'entries' && (
        <div className="detail-section">
          {entries.length === 0 && <div className="empty-state-text">No price book entries found.</div>}
          {entries.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const product = productMap.get(entry.product_id);
                  return (
                    <tr key={`${pricebook.id}_${entry.product_id}`}>
                      <td>{product?.name || 'Unknown Product'}</td>
                      <td><span className="cell-sku">{product?.sku || '—'}</span></td>
                      <td><span className="status-label">{entry.price ?? 'Custom'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'tiered' && (
        <div className="detail-section">
          {tiers.length === 0 && <div className="empty-state-text">No tiered pricing rules found.</div>}
          {tiers.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Min Quantity</th>
                  <th>Max Quantity</th>
                  <th>Discount</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier, index) => (
                  <tr key={`${pricebook.id}_tier_${index}`}>
                    <td>{tier.min_quantity}</td>
                    <td>{tier.max_quantity}</td>
                    <td>{tier.discount_percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'accounts' && (
        <div className="detail-section">
          <div className="empty-state-text">Account-level pricebook assignment is coming soon.</div>
        </div>
      )}
    </div>
  );
}
