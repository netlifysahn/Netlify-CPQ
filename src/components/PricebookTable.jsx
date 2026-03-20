import React from 'react';
import StatusBadge from './StatusBadge';

export default function PricebookTable({ pricebooks, onOpen, onEdit, onDelete, onAdd }) {
  if (pricebooks.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-numeral">0</div>
        <div className="empty-state-eyebrow">Price Books</div>
        <div className="empty-state-title">No price books yet</div>
        <div className="empty-state-text">Create your first price book to get started</div>
        {onAdd && (
          <button className="empty-state-cta" onClick={onAdd}>
            Create Price Book
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
            <th aria-label="Default" />
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
                {pricebook.is_default ? <StatusBadge label="default" tone="grey" /> : null}
              </td>
              <td>
                <span className="cell-count">{Array.isArray(pricebook.entries) ? pricebook.entries.length : 0}</span>
              </td>
              <td>
                <span className="cell-sku">{pricebook.currency || 'USD'}</span>
              </td>
              <td>
                <div className="cell-status">
                  <StatusBadge
                    label={pricebook.active ? 'active' : 'inactive'}
                    tone={pricebook.active ? 'teal' : 'grey'}
                  />
                </div>
              </td>
              <td className="col-actions">
                <div className="actions-group">
                  <button className="action-btn edit" title="Edit" aria-label="Edit" onClick={() => onEdit(pricebook)}>
                    <i className="fa-solid fa-pen-to-square fa-fw fa-sm" aria-hidden="true" />
                  </button>
                  <button className="action-btn delete" title="Delete" aria-label="Delete" onClick={() => onDelete(pricebook.id)}>
                    <i className="fa-solid fa-trash fa-fw fa-sm" aria-hidden="true" />
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
