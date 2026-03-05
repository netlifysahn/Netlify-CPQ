import React, { useState } from 'react';
import { S } from './styles/theme';
import { CATEGORIES, SEED_PRODUCTS, genId } from './data/catalog';
import { IPlus, ISearch } from './components/Icons';
import ProductTable from './components/ProductTable';
import ProductModal from './components/ProductModal';
import BundleList from './components/BundleList';
import BundleModal from './components/BundleModal';
import Confirm from './components/Confirm';

export default function App() {
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState(SEED_PRODUCTS);
  const [bundles, setBundles] = useState([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  // ── Product CRUD ──
  const saveProd = (p) => {
    setProducts((prev) => {
      const i = prev.findIndex((x) => x.id === p.id);
      return i >= 0 ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p];
    });
    setModal(null);
  };

  const delProd = (id) =>
    setConfirm({
      msg: 'Delete this product? It will also be removed from any bundles.',
      fn: () => {
        setProducts((p) => p.filter((x) => x.id !== id));
        setBundles((b) => b.map((x) => ({ ...x, products: x.products.filter((pid) => pid !== id) })));
        setConfirm(null);
      },
    });

  const dupeProd = (p) =>
    setProducts((prev) => [...prev, { ...p, id: genId(), name: p.name + ' (copy)', sku: p.sku + '-COPY' }]);

  // ── Bundle CRUD ──
  const saveBdl = (b) => {
    setBundles((prev) => {
      const i = prev.findIndex((x) => x.id === b.id);
      return i >= 0 ? prev.map((x) => (x.id === b.id ? b : x)) : [...prev, b];
    });
    setModal(null);
  };

  const delBdl = (id) =>
    setConfirm({
      msg: 'Delete this bundle?',
      fn: () => {
        setBundles((b) => b.filter((x) => x.id !== id));
        setConfirm(null);
      },
    });

  // ── Filters ──
  const fp = products.filter((p) => {
    if (catFilter !== 'All' && p.category !== catFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const fb = bundles.filter(
    (b) => !search || b.name.toLowerCase().includes(search.toLowerCase()) || b.sku.toLowerCase().includes(search.toLowerCase())
  );

  const cats = ['All', ...CATEGORIES.filter((c) => products.some((p) => p.category === c))];

  return (
    <div style={S.root}>
      <div style={S.wrap}>
        {/* Header */}
        <div style={S.header}>
          <div style={S.logo}>N</div>
          <div style={S.h1}>Netlify CPQ — Product Catalog</div>
        </div>
        <div style={S.sub}>Define products and bundle them for quotes &amp; orders</div>

        {/* Tabs */}
        <div style={S.tabs}>
          <button style={S.tab(tab === 'products')} onClick={() => { setTab('products'); setSearch(''); setCatFilter('All'); }}>
            Products<span style={S.tabN(tab === 'products')}>{products.length}</span>
          </button>
          <button style={S.tab(tab === 'bundles')} onClick={() => { setTab('bundles'); setSearch(''); }}>
            Bundles<span style={S.tabN(tab === 'bundles')}>{bundles.length}</span>
          </button>
        </div>

        {/* Toolbar */}
        <div style={S.bar}>
          <div style={S.searchWrap}>
            <ISearch />
            <input
              style={S.searchIn}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'products' ? 'Search products…' : 'Search bundles…'}
            />
          </div>
          {tab === 'products' && cats.map((c) => (
            <button key={c} style={S.fBtn(catFilter === c)} onClick={() => setCatFilter(c)}>{c}</button>
          ))}
          <button style={S.addBtn} onClick={() => setModal({ type: tab === 'products' ? 'product' : 'bundle' })}>
            <IPlus />
            {tab === 'products' ? 'Add Product' : 'Create Bundle'}
          </button>
        </div>

        {/* Content */}
        {tab === 'products' && (
          <ProductTable
            products={fp}
            onEdit={(p) => setModal({ type: 'product', data: p })}
            onDupe={dupeProd}
            onDelete={delProd}
          />
        )}

        {tab === 'bundles' && (
          <BundleList
            bundles={fb}
            products={products}
            onEdit={(b) => setModal({ type: 'bundle', data: b })}
            onDelete={delBdl}
          />
        )}
      </div>

      {/* Modals */}
      {modal?.type === 'product' && (
        <ProductModal product={modal.data} onSave={saveProd} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'bundle' && (
        <BundleModal bundle={modal.data} products={products} onSave={saveBdl} onClose={() => setModal(null)} />
      )}
      {confirm && <Confirm msg={confirm.msg} onYes={confirm.fn} onNo={() => setConfirm(null)} />}
    </div>
  );
}
