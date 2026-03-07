import React, { useState } from 'react';
import './styles/app.css';
import { genId } from './data/catalog';
import NetlifyLogo from './components/NetlifyLogo';
import ProductTable from './components/ProductTable';
import ProductModal from './components/ProductModal';
import Confirm from './components/Confirm';

const NAV_ITEMS = [
  { key: 'products', label: 'Products', icon: 'fa-box' },
  { key: 'pricebooks', label: 'Pricebooks', icon: 'fa-book' },
  { key: 'quotes', label: 'Quotes', icon: 'fa-file-invoice-dollar' },
  { key: 'orders', label: 'Orders', icon: 'fa-cart-shopping' },
];

const COMING_SOON_META = {
  pricebooks: { icon: 'fa-book', title: 'Pricebooks' },
  quotes: { icon: 'fa-file-invoice-dollar', title: 'Quotes' },
  orders: { icon: 'fa-cart-shopping', title: 'Orders' },
};

export default function App() {
  const [page, setPage] = useState('products');
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const saveProd = (p) => {
    setProducts((prev) => {
      const i = prev.findIndex((x) => x.id === p.id);
      return i >= 0 ? prev.map((x) => (x.id === p.id ? { ...p, updated_at: new Date().toISOString() } : x)) : [...prev, p];
    });
    setModal(null);
  };

  const delProd = (id) =>
    setConfirm({
      msg: 'Delete this product? This action cannot be undone.',
      fn: () => {
        setProducts((p) => p.filter((x) => x.id !== id));
        setConfirm(null);
      },
    });

  const dupeProd = (p) =>
    setProducts((prev) => [
      ...prev,
      { ...p, id: genId(), name: p.name + ' (copy)', sku: p.sku + '-COPY', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ]);

  const fp = products.filter((p) => {
    if (typeFilter !== 'All' && p.type !== typeFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const types = ['All', ...['platform', 'support', 'credits', 'addon'].filter((t) => products.some((p) => p.type === t))];

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-brand">
          <NetlifyLogo size={34} />
          <span className="sidebar-brand-text">Deal Studio</span>
        </div>
        <div className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`sidebar-item${page === item.key ? ' active' : ''}`}
              onClick={() => { setPage(item.key); setSearch(''); setTypeFilter('All'); }}
            >
              <i className={`fa-solid ${item.icon}`} />
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {page === 'products' && (
          <>
            <h1 className="page-title">Products</h1>
            <p className="page-subtitle">Manage your product catalog</p>

            <div className="toolbar">
              <div className="search-wrap">
                <i className="fa-solid fa-magnifying-glass" />
                <input
                  className="search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products..."
                />
              </div>
              {types.map((t) => (
                <button
                  key={t}
                  className={`filter-btn${typeFilter === t ? ' active' : ''}`}
                  onClick={() => setTypeFilter(t)}
                >
                  {t === 'All' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
              <button className="btn-primary" onClick={() => setModal({ type: 'product' })}>
                <i className="fa-solid fa-plus" />
                Add Product
              </button>
            </div>

            <ProductTable
              products={fp}
              onEdit={(p) => setModal({ type: 'product', data: p })}
              onDupe={dupeProd}
              onDelete={delProd}
            />
          </>
        )}

        {COMING_SOON_META[page] && (
          <div className="coming-soon">
            <div className="coming-soon-icon">
              <i className={`fa-solid ${COMING_SOON_META[page].icon}`} />
            </div>
            <div className="coming-soon-title">{COMING_SOON_META[page].title}</div>
            <div className="coming-soon-text">Coming soon</div>
          </div>
        )}
      </main>

      {/* Modals */}
      {modal?.type === 'product' && (
        <ProductModal product={modal.data} onSave={saveProd} onClose={() => setModal(null)} />
      )}
      {confirm && <Confirm msg={confirm.msg} onYes={confirm.fn} onNo={() => setConfirm(null)} />}
    </div>
  );
}
