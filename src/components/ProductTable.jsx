import React, { useState } from 'react';
import { TYPE_COLORS, UNIT_LABELS, fmtPrice } from '../data/catalog';

export default function ProductTable({ products, onEdit, onDupe, onDelete }) {
  const [expanded, setExpanded] = useState(null);

  if (products.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon"><i className="fa-solid fa-box" /></div>
        <div className="empty-state-title">No products found</div>
        <div className="empty-state-text">Add your first product to get started</div>
      </div>
    );
  }

  const toggleExpand = (id) => setExpanded((prev) => (prev === id ? null : id));

  const parseEntitlements = (raw) => {
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Object.entries(obj || {});
    } catch {
      return [];
    }
  };

  const getConfigIndicators = (config) => {
    if (!config) return [];
    const indicators = [];
    if (config.lock_quantity) indicators.push('Qty locked');
    if (config.lock_price) indicators.push('Price locked');
    if (config.lock_discount) indicators.push('Disc locked');
    if (config.lock_term) indicators.push('Term locked');
    return indicators;
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 24 }} />
            <th>Product</th>
            <th>Type</th>
            <th>Monthly</th>
            <th>Annual</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const ents = parseEntitlements(p.default_entitlements);
            const hasExpandable = ents.length > 0;
            const isExpanded = expanded === p.id;
            const amount = p.default_price?.amount || 0;
            const unit = p.default_price?.unit || 'flat';
            const annual = amount * 12;
            const configInds = getConfigIndicators(p.config);

            return (
              <React.Fragment key={p.id}>
                <tr>
                  <td>
                    {hasExpandable && (
                      <button className="expand-btn" onClick={() => toggleExpand(p.id)}>
                        <i className={`fa-solid fa-chevron-${isExpanded ? 'down' : 'right'}`} />
                      </button>
                    )}
                  </td>
                  <td>
                    <div className="cell-name">{p.name}</div>
                    <div className="cell-sku">{p.sku}</div>
                    {p.description && <div className="cell-description">{p.description}</div>}
                    {configInds.length > 0 && (
                      <div className="config-indicators" style={{ marginTop: 4 }}>
                        {configInds.map((ind) => (
                          <span key={ind} className="config-indicator">{ind}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`badge badge-${p.type}`}>
                      <i className={`fa-solid ${typeIcon(p.type)}`} style={{ fontSize: 10 }} />
                      {p.type}
                    </span>
                  </td>
                  <td>
                    <span className="cell-price">{fmtPrice(amount)}</span>
                    <span className="unit-badge">{UNIT_LABELS[unit] || unit}</span>
                  </td>
                  <td>
                    <span className="cell-price">{amount > 0 ? fmtPrice(annual) : 'Custom'}</span>
                  </td>
                  <td>
                    <span className={`status-dot ${p.active ? 'active' : 'inactive'}`} />
                    <span style={{ fontSize: 12 }}>{p.active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="action-btn edit" title="Edit" onClick={() => onEdit(p)}>
                      <i className="fa-solid fa-pen-to-square" />
                    </button>
                    <button className="action-btn duplicate" title="Duplicate" onClick={() => onDupe(p)}>
                      <i className="fa-solid fa-copy" />
                    </button>
                    <button className="action-btn delete" title="Delete" onClick={() => onDelete(p.id)}>
                      <i className="fa-solid fa-trash-can" />
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="expanded-row">
                    <td />
                    <td colSpan={6}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Entitlements
                      </div>
                      <div className="entitlement-pills">
                        {ents.map(([key, val]) => (
                          <span key={key} className="entitlement-pill">
                            <span className="pill-key">{key}:</span> {String(val)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function typeIcon(type) {
  const map = { platform: 'fa-bolt', support: 'fa-headset', credits: 'fa-coins', addon: 'fa-server' };
  return map[type] || 'fa-box';
}
