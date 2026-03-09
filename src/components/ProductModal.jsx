import React, { useMemo, useState } from 'react';
import {
  PRICE_UNITS,
  PRICING_METHODS,
  PRODUCT_TYPES,
  TERM_BEHAVIORS,
  TYPE_LABELS,
  UNIT_LABELS,
  emptyProduct,
  fmtPrice,
  getProductCategory,
  isBundleProduct,
} from '../data/catalog';

const PILL_COLORS = ['blue', 'green', 'amber', 'purple', 'teal'];

function getPillColor(index) {
  return PILL_COLORS[index % PILL_COLORS.length];
}

function coerceProduct(product) {
  const next = { ...(product || emptyProduct()) };
  next.category = getProductCategory(next);
  next.type = next.category;
  if (!next.configuration_method) next.configuration_method = 'none';
  if (!next.bundle_pricing) next.bundle_pricing = 'header_only';
  if (typeof next.print_members !== 'boolean') next.print_members = true;
  if (!Array.isArray(next.members)) next.members = [];
  return next;
}

function parseNumber(value, fallback = 0) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function ProductModal({ product, products, onSave, onClose }) {
  const [f, setF] = useState(coerceProduct(product));
  const [jsonError, setJsonError] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const s = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const sp = (k, v) => setF((p) => ({ ...p, default_price: { ...p.default_price, [k]: v } }));
  const sc = (k, v) => setF((p) => ({ ...p, config: { ...p.config, [k]: v } }));

  const ok = f.name.trim() && f.sku.trim();

  const validateJson = (val) => {
    s('default_entitlements', val);
    if (!val.trim() || val.trim() === '{}') {
      setJsonError('');
      return;
    }
    try {
      JSON.parse(val);
      setJsonError('');
    } catch (e) {
      setJsonError(e.message);
    }
  };

  const parsedEntitlements = (() => {
    try {
      const raw = typeof f.default_entitlements === 'string' ? f.default_entitlements : JSON.stringify(f.default_entitlements);
      return Object.entries(JSON.parse(raw) || {});
    } catch {
      return [];
    }
  })();

  const monthlyAmount = parseFloat(f.default_price.amount) || 0;
  const productMap = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products]);
  const nonBundleProducts = useMemo(() => {
    const selectedIds = new Set((f.members || []).map((m) => m.product_id));
    return (products || []).filter((p) => !isBundleProduct(p) && p.id !== f.id && !selectedIds.has(p.id));
  }, [products, f.members, f.id]);

  const filteredPickerProducts = nonBundleProducts.filter((p) => {
    if (!memberQuery.trim()) return true;
    const q = memberQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  const categoryOptions = useMemo(() => {
    const values = [...PRODUCT_TYPES];
    const seen = new Set(values);
    const include = (value) => {
      if (!value || seen.has(value)) return;
      seen.add(value);
      values.push(value);
    };
    include(getProductCategory(f));
    (products || []).forEach((product) => include(getProductCategory(product)));
    return values;
  }, [f, products]);

  const addMember = (productId) => {
    const prod = productMap.get(productId);
    if (!prod) return;
    setF((prev) => ({
      ...prev,
      members: [...(prev.members || []), {
        product_id: productId,
        name: prod.name,
        sku: prod.sku,
        qty: 1,
        unit_type: prod.default_price?.unit || 'flat',
        list_price: parseFloat(prod.default_price?.amount) || 0,
      }],
    }));
    setMemberQuery('');
    setPickerOpen(false);
  };

  const updateMember = (index, key, value) => {
    setF((prev) => {
      const members = [...(prev.members || [])];
      const member = { ...members[index], [key]: value };
      members[index] = member;
      return { ...prev, members };
    });
  };

  const removeMember = (index) => {
    setF((prev) => {
      const members = [...(prev.members || [])];
      members.splice(index, 1);
      return {
        ...prev,
        members: members.map((member, i) => ({ ...member, sort_order: i + 1 })),
      };
    });
  };

  const handleSave = () => {
    if (!ok) return;

    let entitlements = f.default_entitlements;
    try {
      if (typeof entitlements === 'string') JSON.parse(entitlements);
    } catch {
      entitlements = '{}';
    }

    const normalizedMembers = (f.members || []).map((member) => ({
      product_id: member.product_id,
      name: member.name || productMap.get(member.product_id)?.name || '',
      sku: member.sku || productMap.get(member.product_id)?.sku || '',
      qty: Math.max(1, parseNumber(member.qty, 1)),
      unit_type: member.unit_type || 'flat',
      list_price: parseNumber(member.list_price, 0),
    }));

    onSave({
      ...f,
      category: getProductCategory(f),
      type: getProductCategory(f),
      default_price: { ...f.default_price, amount: parseFloat(f.default_price.amount) || 0 },
      default_entitlements: entitlements,
      config: {
        ...f.config,
        default_quantity: parseInt(f.config.default_quantity, 10) || 1,
        min_quantity: parseInt(f.config.min_quantity, 10) || 1,
        max_quantity: parseInt(f.config.max_quantity, 10) || 999,
      },
      configuration_method: isBundleProduct(f) ? 'bundle' : 'none',
      members: isBundleProduct(f) ? normalizedMembers : [],
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{product ? 'Edit Product' : 'New Product'}</div>

        <div className="modal-section">
          <div className="modal-section-label">
            <i className="fa-solid fa-tag" />
            Basic Info
          </div>

          <div className="field">
            <label className="field-label">Product Name</label>
            <input className="field-input" value={f.name} onChange={(e) => s('name', e.target.value)} placeholder="e.g. Netlify Enterprise" />
          </div>

          <div className="grid-2">
            <div className="field">
              <label className="field-label">SKU</label>
              <input className="field-input" value={f.sku} onChange={(e) => s('sku', e.target.value.toUpperCase())} placeholder="NTL-XXX" style={{ fontFamily: "'Menlo', monospace" }} />
            </div>
            <div className="field">
              <label className="field-label">Category</label>
              <select
                className="field-select"
                value={getProductCategory(f)}
                onChange={(e) => {
                  const val = e.target.value;
                  s('category', val);
                  s('type', val);
                  // Auto-set configuration_method when switching to/from bundle
                  s('configuration_method', val === 'bundle' ? 'bundle' : 'none');
                }}
              >
                {categoryOptions.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t] || (t.charAt(0).toUpperCase() + t.slice(1))}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Description</label>
            <textarea className="field-textarea" value={f.description} onChange={(e) => s('description', e.target.value)} placeholder="Product description..." />
          </div>

          <div className="grid-2">
            <div className="checkbox-row">
              <input type="checkbox" checked={f.active} onChange={(e) => s('active', e.target.checked)} id="pActive" />
              <label htmlFor="pActive" className="checkbox-label">Active in catalog</label>
            </div>
            <div className="checkbox-row">
              <input type="checkbox" checked={f.hide} onChange={(e) => s('hide', e.target.checked)} id="pHide" />
              <label htmlFor="pHide" className="checkbox-label">Hide from quotes</label>
            </div>
          </div>
        </div>

        <div className="modal-section">
          <div className="modal-section-label">
            <i className="fa-solid fa-dollar-sign" />
            Pricing
          </div>

          <div className="grid-3">
            <div className="field">
              <label className="field-label">Monthly Price ($)</label>
              <input className="field-input" type="number" min="0" step="0.01" value={f.default_price.amount} onChange={(e) => sp('amount', e.target.value)} placeholder="0.00" />
            </div>
            <div className="field">
              <label className="field-label">Unit</label>
              <select className="field-select" value={f.default_price.unit} onChange={(e) => sp('unit', e.target.value)}>
                {PRICE_UNITS.map((u) => (
                  <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Method</label>
              <select className="field-select" value={f.default_price.pricing_method} onChange={(e) => sp('pricing_method', e.target.value)}>
                {PRICING_METHODS.map((m) => (
                  <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Unit of Measure</label>
            <input className="field-input" value={f.unit_of_measure} onChange={(e) => s('unit_of_measure', e.target.value)} placeholder="e.g. credits, members, instances" />
          </div>

          {monthlyAmount > 0 && (
            <div className="price-preview">
              <div className="price-preview-item">
                <div className="price-preview-label">12mo</div>
                <div className="price-preview-value">{fmtPrice(monthlyAmount * 12)}</div>
              </div>
              <div className="price-preview-item">
                <div className="price-preview-label">24mo</div>
                <div className="price-preview-value">{fmtPrice(monthlyAmount * 24)}</div>
              </div>
              <div className="price-preview-item">
                <div className="price-preview-label">36mo</div>
                <div className="price-preview-value">{fmtPrice(monthlyAmount * 36)}</div>
              </div>
            </div>
          )}
        </div>

        {isBundleProduct(f) && (
          <div className="modal-section">
            <div className="modal-section-label">
              <i className="fa-solid fa-boxes-stacked" />
              Package Components
            </div>

            <div className="pkg-components">
              {(f.members || []).length > 0 && (
                <table className="pkg-components-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th style={{ width: 70 }}>Qty</th>
                      <th>Unit</th>
                      <th style={{ width: 36 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {(f.members || []).map((member, index) => (
                      <tr key={`${member.product_id}_${index}`}>
                        <td>{member.name || productMap.get(member.product_id)?.name || 'Unknown'}</td>
                        <td className="cell-sku">{member.sku || productMap.get(member.product_id)?.sku || ''}</td>
                        <td>
                          <input
                            className="field-input"
                            type="number"
                            min="1"
                            step="1"
                            value={member.qty ?? member.default_quantity ?? 1}
                            onChange={(e) => updateMember(index, 'qty', parseInt(e.target.value, 10) || 1)}
                            style={{ width: '100%', padding: '4px 6px', textAlign: 'center' }}
                          />
                        </td>
                        <td>{UNIT_LABELS[member.unit_type || member.price_behavior] || member.unit_type || 'Flat'}</td>
                        <td>
                          <button type="button" className="action-btn delete" onClick={() => removeMember(index)} title="Remove">
                            <i className="fa-solid fa-xmark" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {(f.members || []).length === 0 && (
                <div className="bundle-members-empty">No components added.</div>
              )}

              <div className="bundle-picker-wrap">
                <button type="button" className="btn-secondary bundle-add-btn" onClick={() => setPickerOpen((prev) => !prev)}>
                  Add Component
                </button>

                {pickerOpen && (
                  <div className="bundle-picker">
                    <input
                      className="field-input bundle-picker-search"
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      placeholder="Search products..."
                    />
                    <div className="bundle-picker-list">
                      {filteredPickerProducts.length === 0 && <div className="bundle-picker-empty">No matching products</div>}
                      {filteredPickerProducts.map((candidate) => (
                        <button key={candidate.id} type="button" className="bundle-picker-item" onClick={() => addMember(candidate.id)}>
                          <span>{candidate.name}</span>
                          <span className="bundle-picker-sku">{candidate.sku}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="modal-section">
          <div className="modal-section-label">
            <i className="fa-solid fa-gear" />
            Service
          </div>

          <div className="grid-2">
            <div className="field">
              <label className="field-label">Default Term (months)</label>
              <input className="field-input" type="number" value={f.default_term} onChange={(e) => s('default_term', parseInt(e.target.value, 10) || 0)} />
            </div>
            <div className="field">
              <label className="field-label">Term Behavior</label>
              <select className="field-select" value={f.term_behavior} onChange={(e) => s('term_behavior', e.target.value)}>
                {TERM_BEHAVIORS.map((b) => (
                  <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="modal-section">
          <div className="modal-section-label">
            <i className="fa-solid fa-shield-halved" />
            Entitlements
          </div>

          <div className="field">
            <label className="field-label">JSON</label>
            <textarea
              className={`field-textarea entitlements-json${jsonError ? ' json-invalid' : (f.default_entitlements && f.default_entitlements !== '{}' ? ' json-valid' : '')}`}
              value={typeof f.default_entitlements === 'string' ? f.default_entitlements : JSON.stringify(f.default_entitlements, null, 2)}
              onChange={(e) => validateJson(e.target.value)}
              placeholder='{"builds": 1000, "bandwidth_gb": 100}'
            />
            {jsonError && <div className="json-error">{jsonError}</div>}
          </div>

          {parsedEntitlements.length > 0 && (
            <div className="entitlement-pills">
              {parsedEntitlements.map(([key, val], i) => (
                <span key={key} className={`entitlement-pill pill-${getPillColor(i)}`}>
                  <span className="pill-key">{key}:</span> {String(val)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="modal-section">
          <div className="modal-section-label">
            <i className="fa-solid fa-gear" />
            Configuration
          </div>

          <div className="grid-2">
            <div className="checkbox-row">
              <input type="checkbox" checked={f.config.lock_quantity} onChange={(e) => sc('lock_quantity', e.target.checked)} id="lockQty" />
              <label htmlFor="lockQty" className="checkbox-label">Lock quantity</label>
            </div>
            <div className="checkbox-row">
              <input type="checkbox" checked={f.config.lock_price} onChange={(e) => sc('lock_price', e.target.checked)} id="lockPrice" />
              <label htmlFor="lockPrice" className="checkbox-label">Lock price</label>
            </div>
            <div className="checkbox-row">
              <input type="checkbox" checked={f.config.lock_discount} onChange={(e) => sc('lock_discount', e.target.checked)} id="lockDisc" />
              <label htmlFor="lockDisc" className="checkbox-label">Lock discount</label>
            </div>
            <div className="checkbox-row">
              <input type="checkbox" checked={f.config.lock_term} onChange={(e) => sc('lock_term', e.target.checked)} id="lockTerm" />
              <label htmlFor="lockTerm" className="checkbox-label">Lock term</label>
            </div>
          </div>

          <div className="grid-3">
            <div className="field">
              <label className="field-label">Default Qty</label>
              <input className="field-input" type="number" value={f.config.default_quantity} onChange={(e) => sc('default_quantity', e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Min Qty</label>
              <input className="field-input" type="number" value={f.config.min_quantity} onChange={(e) => sc('min_quantity', e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Max Qty</label>
              <input className="field-input" type="number" value={f.config.max_quantity} onChange={(e) => sc('max_quantity', e.target.value)} />
            </div>
          </div>

          <div className="checkbox-row">
            <input type="checkbox" checked={f.config.edit_name} onChange={(e) => sc('edit_name', e.target.checked)} id="editName" />
            <label htmlFor="editName" className="checkbox-label">Allow editing product name on quote</label>
          </div>

          <div className="field">
            <label className="field-label">Default Description</label>
            <textarea className="field-textarea" value={f.config.default_description} onChange={(e) => sc('default_description', e.target.value)} placeholder="Default line item description..." />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={handleSave} disabled={!ok}>
            Save Product
          </button>
        </div>
      </div>
    </div>
  );
}
