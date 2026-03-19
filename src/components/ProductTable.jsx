import React, { useState } from 'react';
import { TYPE_LABELS, calcBundleMonthlyTotal, fmtPrice, getProductCategory, isBundleProduct } from '../data/catalog';
import StatusBadge from './StatusBadge';

export default function ProductTable({ products, allProducts, onEdit, onDupe, onDelete, onAdd }) {
  const [expanded, setExpanded] = useState(null);
  const productMap = new Map((allProducts || products).map((product) => [product.id, product]));

  if (products.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-numeral">0</div>
        <div className="empty-state-eyebrow">Products</div>
        <div className="empty-state-title">No products yet</div>
        <div className="empty-state-text">Add your first product to get started</div>
        {onAdd && (
          <button className="empty-state-cta" onClick={onAdd}>
            Add Product
          </button>
        )}
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

  const parseAmount = (value) => {
    const amount = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(amount) ? amount : null;
  };

  const renderMonthly = (amount) => {
    const normalized = parseAmount(amount);
    if (normalized === null || normalized <= 0) return null;
    return <span className="price-monthly">{fmtPrice(normalized)}</span>;
  };

  const renderAnnual = (amount) => {
    const normalized = parseAmount(amount);
    if (normalized === null || normalized <= 0) return null;
    return <span className="price-annual">{fmtPrice(normalized * 12)}</span>;
  };

  return (
    <div className="table-card">
      <table className="data-table data-table-products">
        <thead>
          <tr>
            <th className="col-product">
              <div className="product-name-cell product-name-cell-header">
                <span className="product-chevron-slot" aria-hidden="true" />
                <span>Product</span>
              </div>
            </th>
            <th className="col-type">Type</th>
            <th className="col-monthly">Monthly</th>
            <th className="col-annual" style={{ paddingRight: '40px' }}>Annual</th>
            <th className="col-status" style={{ paddingLeft: '40px' }}>Status</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const category = getProductCategory(p);
            const ents = parseEntitlements(p.default_entitlements);
            const bundle = isBundleProduct(p);
            const members = Array.isArray(p.members) ? [...p.members].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)) : [];
            const hasExpandable = ents.length > 0 || (bundle && members.length > 0);
            const isExpanded = expanded === p.id;
            const amount = bundle ? calcBundleMonthlyTotal(p, productMap) : p.default_price?.amount;

            return (
              <React.Fragment key={p.id}>
                <tr>
                  <td className="col-product">
                    <div className="product-name-cell">
                      <span className="product-chevron-slot">
                        {hasExpandable && (
                          <button
                            type="button"
                            className="expand-btn product-expand-btn"
                            aria-label={isExpanded ? `Collapse ${p.name}` : `Expand ${p.name}`}
                            onClick={() => toggleExpand(p.id)}
                          >
                            {isExpanded ? '▾' : '▸'}
                          </button>
                        )}
                      </span>
                      <button
                        type="button"
                        className="name-link product-name-trigger"
                        onClick={() => onEdit(p)}
                      >
                        {p.name}
                      </button>
                    </div>
                  </td>
                  <td className="col-type">
                    <span className={`type-pill type-${category}`}>{TYPE_LABELS[category] || category}</span>
                  </td>
                  <td className="col-monthly">{renderMonthly(amount)}</td>
                  <td className="col-annual" style={{ paddingRight: '40px' }}>{renderAnnual(amount)}</td>
                  <td className="col-status" style={{ paddingLeft: '40px' }}>
                    <div className="cell-status">
                      <StatusBadge
                        label={p.active ? 'Active' : 'Inactive'}
                        tone={p.active ? 'teal' : 'grey'}
                      />
                    </div>
                  </td>
                  <td className="col-actions">
                    <div className="actions-group">
                      <button className="action-btn duplicate" title="Duplicate" aria-label="Duplicate" onClick={() => onDupe(p)}>
                        <i className="fa-solid fa-clone fa-fw fa-sm" aria-hidden="true" />
                      </button>
                      <button className="action-btn delete" title="Delete" aria-label="Delete" onClick={() => onDelete(p.id)}>
                        <i className="fa-solid fa-trash fa-fw fa-sm" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="expanded-row">
                    <td colSpan={6}>
                      {bundle && members.length > 0 && (
                        <div className="bundle-members">
                          <div className="expanded-label">Package Members</div>
                          {members.map((member) => {
                            const memberProduct = productMap.get(member.product_id);
                            if (!memberProduct) return null;
                            return (
                              <div key={`${p.id}_${member.product_id}_${member.sort_order}`} className="bundle-member-row">
                                <span className="bundle-member-name">{memberProduct.name}</span>
                                <span className="bundle-member-qty">qty {member.default_quantity || 0}</span>
                                <span className="bundle-member-behavior">{member.price_behavior || 'related'}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {ents.length > 0 && (
                        <>
                          <div className="expanded-label">Entitlements</div>
                          <div className="entitlement-pills">
                            {ents.map(([key, val]) => (
                              <span key={key} className="entitlement-pill">
                                <span className="pill-key">{key}:</span> {String(val)}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
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
