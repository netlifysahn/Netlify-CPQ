import React from 'react';
import { getPricebookStatus } from '../data/pricebooks';

export default function PricebookTable({ pricebooks, onOpen, onEdit, onDelete, onAdd }) {
  if (pricebooks.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon"><i className="fa-solid fa-book" /></div>
        <div className="empty-state-title">No pricebooks yet</div>
        <div className="empty-state-text">Create your first pricebook to get started</div>
        {onAdd && (
          <button className="empty-state-cta" onClick={onAdd}>
            <i className="fa-solid fa-plus" /> Create Pricebook
          </button>
        )}
      </div>
    );
  }

  return (
    <table className="data-table">
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
              <span className="status-label">{Array.isArray(pricebook.entries) ? pricebook.entries.length : 0}</span>
            </td>
            <td>
              <span className="cell-sku">{pricebook.currency || 'USD'}</span>
            </td>
            <td>
              <span className={`status-badge${pricebook.active ? ' active' : ''}`}>{getPricebookStatus(pricebook)}</span>
            </td>
            <td className="col-actions">
              <div className="actions-group">
                <button className="action-btn edit" title="Edit" onClick={() => onEdit(pricebook)}>
                  <i className="fa-solid fa-pen-to-square" />
                </button>
                <button className="action-btn delete" title="Delete" onClick={() => onDelete(pricebook.id)}>
                  <i className="fa-solid fa-trash-can" />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
