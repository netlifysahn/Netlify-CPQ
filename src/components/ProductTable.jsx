import React, { useState } from 'react';
import { calcBundleMonthlyTotal, fmtPrice, isBundleProduct } from '../data/catalog';

export default function ProductTable({ products, allProducts, onEdit, onDupe, onDelete }) {
  const [expanded, setExpanded] = useState(null);
  const productMap = new Map((allProducts || products).map((product) => [product.id, product]));

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

  const renderMonthly = (amount) => {
    if (amount === undefined || amount === null || amount === '') return <span className="price-dash">&mdash;</span>;
    if (amount === 0) return <span className="price-included">Included</span>;
    return <span className="price-monthly">{fmtPrice(amount)}</span>;
  };

  const renderAnnual = (amount) => {
    if (!amount || amount === 0) return <span className="price-dash">&mdash;</span>;
    return <span className="price-annual">{fmtPrice(amount * 12)}</span>;
  };

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th className="col-expand" />
          <th>Product</th>
          <th>Type</th>
          <th>Monthly</th>
          <th>Annual</th>
          <th>Status</th>
          <th className="col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        {products.map((p) => {
          const ents = parseEntitlements(p.default_entitlements);
          const bundle = isBundleProduct(p);
          const members = Array.isArray(p.members) ? [...p.members].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)) : [];
          const hasExpandable = ents.length > 0 || (bundle && members.length > 0);
          const isExpanded = expanded === p.id;
          const amount = bundle ? calcBundleMonthlyTotal(p, productMap) : p.default_price?.amount;

          return (
            <React.Fragment key={p.id}>
              <tr>
                <td className="col-expand">
                  {hasExpandable && (
                    <button className="expand-btn" onClick={() => toggleExpand(p.id)}>
                      <i className={`fa-solid fa-chevron-${isExpanded ? 'down' : 'right'}`} />
                    </button>
                  )}
                </td>
                <td>
                  <div className="cell-name-wrap">
                    <div className="cell-name">{p.name}</div>
                  </div>
                  <div className="cell-sku">{p.sku}</div>
                  {p.description && <div className="cell-description">{p.description}</div>}
                </td>
                <td>
                  <span className={`type-pill type-${p.type}`}>{p.type}</span>
                </td>
                <td>{renderMonthly(amount)}</td>
                <td>{renderAnnual(amount)}</td>
                <td>
                  <div className="cell-status">
                    <span className={`status-dot ${p.active ? 'active' : 'inactive'}`} />
                    <span className="status-label">{p.active ? 'Active' : 'Inactive'}</span>
                  </div>
                </td>
                <td className="col-actions">
                  <div className="actions-group">
                    <button className="action-btn edit" title="Edit" onClick={() => onEdit(p)}>
                      <i className="fa-solid fa-pen-to-square" />
                    </button>
                    <button className="action-btn duplicate" title="Duplicate" onClick={() => onDupe(p)}>
                      <i className="fa-solid fa-copy" />
                    </button>
                    <button className="action-btn delete" title="Delete" onClick={() => onDelete(p.id)}>
                      <i className="fa-solid fa-trash-can" />
                    </button>
                  </div>
                </td>
              </tr>
              {isExpanded && (
                <tr className="expanded-row">
                  <td className="col-expand" />
                  <td colSpan={6}>
                    {bundle && members.length > 0 && (
                      <div className="bundle-members">
                        <div className="expanded-label">Bundle Members</div>
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
  );
}
