import React from 'react';
import { fmtCurrency, calcQuoteTotals } from '../data/quotes';

const STATUS_COLORS = {
  draft: 'grey',
  active: 'teal',
  pending: 'yellow',
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
        <div className="empty-state-title">No orders yet</div>
        <div className="empty-state-text">Create your first order to get started</div>
        <button className="btn-primary" onClick={onNew}>New Order</button>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Name</th>
            <th>Account</th>
            <th>Owner</th>
            <th>Status</th>
            <th>ACV</th>
            <th>Start Date</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const totals = calcQuoteTotals(order);
            const tone = STATUS_COLORS[order.status] || 'grey';
            return (
              <tr key={order.id} className="table-row-clickable" onClick={() => onOpen(order)}>
                <td className="cell-mono">{order.order_number || '—'}</td>
                <td className="cell-name">{order.name || 'Untitled Order'}</td>
                <td>{order.customer_name || '—'}</td>
                <td>{order.prepared_by || '—'}</td>
                <td>
                  <span className={`status-pill status-pill--${tone}`}>
                    {order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Draft'}
                  </span>
                </td>
                <td className="cell-currency">{fmtCurrency(totals.annual)}</td>
                <td>{fmtDate(order.start_date)}</td>
                <td className="cell-muted">
                  {order.updated_at ? new Date(order.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </td>
                <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="row-action-btn" title="Clone" onClick={() => onDupe(order)}>
                    <i className="fa-solid fa-clone fa-fw" />
                  </button>
                  <button className="row-action-btn row-action-btn--danger" title="Delete" onClick={() => onDelete(order.id)}>
                    <i className="fa-solid fa-trash fa-fw" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
