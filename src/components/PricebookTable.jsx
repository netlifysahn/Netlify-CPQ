import React from 'react';
import { getPricebookStatus } from '../data/pricebooks';

export default function PricebookTable({ pricebooks, onOpen, onEdit, onDelete, onAdd }) {
  if (pricebooks.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-numeral">0</div>
        <div className="empty-state-eyebrow">Pricebooks</div>
        <div className="empty-state-title">No pricebooks yet</div>
        <div className="empty-state-text">Create your first pricebook to get started</div>
        {onAdd && (
          <button className="empty-state-cta" onClick={onAdd}>
            Create Pricebook
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="table-card">
      <table className="data-table data-table-pricebooks">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Products</th>
            <th>Currency</th>
            <th>Status</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {pricebooks.map((pricebook) => (
            <tr key={pricebook.id}>
              <td>
                <button className="name-link" onClick={() => onOpen(pricebook.id)}>
                  {pricebook.name}
                </button>
              </td>
              <td>
                <div className="cell-description cell-description-static">
                  {pricebook.description || '—'}
                </div>
              </td>
              <td>
                <span className="cell-count">{Array.isArray(pricebook.entries) ? pricebook.entries.length : 0}</span>
              </td>
              <td>
                <span className="cell-sku">{pricebook.currency || 'USD'}</span>
              </td>
              <td>
                <div className="cell-status">
                  <span className={`status-dot ${pricebook.active ? 'active' : 'inactive'}`} />
                  <span className="status-label">
                    {pricebook.active ? 'Active' : 'Inactive'}
                    {pricebook.active && pricebook.is_default && <span className="status-default-tag"> · Default</span>}
                  </span>
                </div>
              </td>
              <td className="col-actions">
                <div className="actions-group">
                  <button className="action-btn edit" title="Edit" onClick={() => onEdit(pricebook)}>
                    Edit
                  </button>
                  <button className="action-btn delete" title="Delete" onClick={() => onDelete(pricebook.id)}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
