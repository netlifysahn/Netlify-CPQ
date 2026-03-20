import React from 'react';
import { fmtCurrency, calcQuoteTotals } from '../data/quotes';
import StatusBadge from './StatusBadge';

const STATUS_TONES = {
  draft: 'grey',
  active: 'blue',
  pending: 'gold',
  cancelled: 'red',
  completed: 'green',
  invoiced: 'blue',
};

const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function OrderList({ orders, onNew, onOpen, onDupe, onDelete }) {
  if (!orders || orders.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-numeral">0</div>
        <div className="empty-state-eyebrow">Orders</div>
        <div className="empty-state-title">No orders yet</div>
        <div className="empty-state-text">Create your first order to get started</div>
        {onNew && (
          <button className="empty-state-cta" onClick={onNew}>
            New Order
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="table-card">
      <table className="data-table data-table-orders">
        <thead>
          <tr>
            <th className="col-order-number">Order #</th>
            <th className="col-name">Name</th>
            <th className="col-account">Account</th>
            <th className="col-owner">Owner</th>
            <th className="col-status">Status</th>
            <th className="col-acv">ACV</th>
            <th className="col-date">Start Date</th>
            <th className="col-updated">Updated</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const totals = calcQuoteTotals(order);
            const tone = STATUS_TONES[order.status] || 'grey';
            return (
              <tr key={order.id} className="table-row-clickable" onClick={() => onOpen(order)}>
                <td className="col-order-number cell-mono">{order.order_number || '—'}</td>
                <td className="col-name cell-name">{order.name || 'Untitled Order'}</td>
                <td className="col-account">{order.customer_name || '—'}</td>
                <td className="col-owner">{order.prepared_by || '—'}</td>
                <td className="col-status">
                  <div className="cell-status">
                    <StatusBadge
                      label={order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Draft'}
                      tone={tone}
                    />
                  </div>
                </td>
                <td className="col-acv cell-currency">{fmtCurrency(totals.annual)}</td>
                <td className="col-date">{fmtDate(order.start_date)}</td>
                <td className="col-updated cell-muted">
                  {order.updated_at ? new Date(order.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </td>
                <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                  <div className="actions-group">
                    <button className="action-btn duplicate" title="Clone" aria-label="Clone" onClick={() => onDupe(order)}>
                      <i className="fa-solid fa-clone fa-fw fa-sm" aria-hidden="true" />
                    </button>
                    <button className="action-btn delete" title="Delete" aria-label="Delete" onClick={() => onDelete(order.id)}>
                      <i className="fa-solid fa-trash fa-fw fa-sm" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
