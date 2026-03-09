import React, { useMemo, useState } from 'react';
import ProductPicker from './ProductPicker';
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
  const existingComponents = Array.isArray(next.components) ? next.components : [];
  const existingMembers = Array.isArray(next.members) ? next.members : [];
  next.category = getProductCategory(next);
  next.type = next.category;
  if (!next.configuration_method) next.configuration_method = 'none';
  if (!next.bundle_pricing) next.bundle_pricing = 'header_only';
  if (typeof next.print_members !== 'boolean') next.print_members = true;
  next.members = existingMembers.length > 0 ? existingMembers : existingComponents;
  if (!Array.isArray(next.components)) next.components = [];
  return next;
}

function parseNumber(value, fallback = 0) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const COLLAPSIBLE_SECTION_KEYS = {
  BASIC_INFO: 'basicInfo',
  PRICING: 'pricing',
  PACKAGE_COMPONENTS: 'packageComponents',
  SERVICE: 'service',
  ENTITLEMENTS: 'entitlements',
  CONFIGURATION: 'configuration',
};

export default function ProductModal({ product, products, onSave, onClose }) {
  const [f, setF] = useState(coerceProduct(product));
  const [jsonError, setJsonError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openSections, setOpenSections] = useState({
    [COLLAPSIBLE_SECTION_KEYS.BASIC_INFO]: true,
    [COLLAPSIBLE_SECTION_KEYS.PRICING]: true,
    [COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS]: true,
    [COLLAPSIBLE_SECTION_KEYS.SERVICE]: true,
    [COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS]: false,
    [COLLAPSIBLE_SECTION_KEYS.CONFIGURATION]: false,
  });

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
  const isPackage = isBundleProduct(f) || getProductCategory(f) === 'bundle';
  const productMap = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products]);
  const nonBundleProducts = useMemo(() => {
    const selectedIds = new Set((f.members || []).map((m) => m.product_id));
    return (products || []).filter((p) => getProductCategory(p) !== 'bundle' && !isBundleProduct(p) && p.id !== f.id && !selectedIds.has(p.id));
  }, [products, f.members, f.id]);

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

  const addMember = (productOrId) => {
    const productId = typeof productOrId === 'string' ? productOrId : productOrId?.id;
    const prod = typeof productOrId === 'string' ? productMap.get(productId) : productOrId;
    if (!prod) return;
    setF((prev) => ({
      ...prev,
      members: [...(prev.members || []), {
        product_id: productId,
        name: prod.name,
        sku: prod.sku,
        qty: 1,
        default_quantity: 1,
        unit_type: prod.default_price?.unit || 'flat',
        price_behavior: 'related',
        list_price: parseFloat(prod.default_price?.amount) || 0,
        sort_order: (prev.members || []).length + 1,
      }],
    }));
  };

  const updateMember = (index, key, value) => {
    setF((prev) => {
      const members = [...(prev.members || [])];
      const nextValue = key === 'qty' ? Math.max(1, parseNumber(value, 1)) : value;
      const member = { ...members[index], [key]: nextValue };
      if (key === 'qty') member.default_quantity = nextValue;
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

  const toggleSection = (sectionKey) => {
    setOpenSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  const toggleIsPackage = (enabled) => {
    setF((prev) => ({
      ...prev,
      category: enabled ? 'bundle' : 'platform',
      type: enabled ? 'bundle' : 'platform',
      configuration_method: enabled ? 'bundle' : 'none',
    }));
    setPickerOpen(false);
    setOpenSections((prev) => ({
      ...prev,
      [COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS]: enabled ? true : prev[COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS],
    }));
  };

  const handleSave = () => {
    if (!ok) return;

    let entitlements = f.default_entitlements;
    try {
      if (typeof entitlements === 'string') JSON.parse(entitlements);
    } catch {
      entitlements = '{}';
    }

    const normalizedMembers = (f.members || []).map((member, index) => {
      const referencedProduct = productMap.get(member.product_id);
      const qty = Math.max(1, parseNumber(member.qty ?? member.default_quantity, 1));
      return {
      product_id: member.product_id,
      name: member.name || referencedProduct?.name || '',
      sku: member.sku || referencedProduct?.sku || '',
      qty,
      default_quantity: qty,
      unit_type: member.unit_type || referencedProduct?.default_price?.unit || 'flat',
      price_behavior: member.price_behavior || 'related',
      list_price: parseNumber(member.list_price ?? referencedProduct?.default_price?.amount, 0),
      sort_order: index + 1,
    };
    });

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
      configuration_method: isPackage ? 'bundle' : 'none',
      members: isPackage ? normalizedMembers : [],
      components: isPackage ? normalizedMembers : [],
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-theme-products product-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{product ? 'Edit Product' : 'New Product'}</div>

        <div className="modal-section">
          <button
            type="button"
            className="modal-section-label modal-section-toggle"
            onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.BASIC_INFO)}
            aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.BASIC_INFO]}
          >
            <span>Basic Info</span>
            <i className={`fa-solid ${openSections[COLLAPSIBLE_SECTION_KEYS.BASIC_INFO] ? 'fa-chevron-down' : 'fa-chevron-up'}`} />
          </button>

          <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.BASIC_INFO] ? 'is-open' : ''}`}>
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
                    if (val === 'bundle') {
                      setOpenSections((prev) => ({ ...prev, [COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS]: true }));
                    } else {
                      setPickerOpen(false);
                    }
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
              <div className="checkbox-row">
                <input type="checkbox" checked={isPackage} onChange={(e) => toggleIsPackage(e.target.checked)} id="pPackage" />
                <label htmlFor="pPackage" className="checkbox-label">Is a package</label>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-section">
          <button
            type="button"
            className="modal-section-label modal-section-toggle"
            onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.PRICING)}
            aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.PRICING]}
          >
            <span>Pricing</span>
            <i className={`fa-solid ${openSections[COLLAPSIBLE_SECTION_KEYS.PRICING] ? 'fa-chevron-down' : 'fa-chevron-up'}`} />
          </button>

          <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.PRICING] ? 'is-open' : ''}`}>
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

            {monthlyAmount > 0 && (
              <div className="price-preview">
                <div className="price-preview-item">
                  <div className="price-preview-label">12 month</div>
                  <div className="price-preview-value">{fmtPrice(monthlyAmount * 12)}</div>
                </div>
                <div className="price-preview-item">
                  <div className="price-preview-label">24 month</div>
                  <div className="price-preview-value">{fmtPrice(monthlyAmount * 24)}</div>
                </div>
                <div className="price-preview-item">
                  <div className="price-preview-label">36 month</div>
                  <div className="price-preview-value">{fmtPrice(monthlyAmount * 36)}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {isPackage && (
          <div className="modal-section">
            <button
              type="button"
              className="modal-section-label modal-section-toggle"
              onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS)}
              aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS]}
            >
              <span>Package Components</span>
              <i className={`fa-solid ${openSections[COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS] ? 'fa-chevron-down' : 'fa-chevron-up'}`} />
            </button>

            <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS] ? 'is-open' : ''}`}>
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
                              onChange={(e) => updateMember(index, 'qty', e.target.value)}
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
                  <button type="button" className="btn-secondary bundle-add-btn" onClick={() => setPickerOpen(true)}>
                    Add Component
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="modal-section">
          <button
            type="button"
            className="modal-section-label modal-section-toggle"
            onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.SERVICE)}
            aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.SERVICE]}
          >
            <span>Service</span>
            <i className={`fa-solid ${openSections[COLLAPSIBLE_SECTION_KEYS.SERVICE] ? 'fa-chevron-down' : 'fa-chevron-up'}`} />
          </button>

          <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.SERVICE] ? 'is-open' : ''}`}>
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
        </div>

        <div className="modal-section">
          <button
            type="button"
            className="modal-section-label modal-section-toggle"
            onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS)}
            aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS]}
          >
            <span>Entitlements</span>
            <i className={`fa-solid ${openSections[COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS] ? 'fa-chevron-down' : 'fa-chevron-up'}`} />
          </button>

          <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS] ? 'is-open' : ''}`}>
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
        </div>

        <div className="modal-section">
          <button
            type="button"
            className="modal-section-label modal-section-toggle"
            onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.CONFIGURATION)}
            aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.CONFIGURATION]}
          >
            <span>Configuration</span>
            <i className={`fa-solid ${openSections[COLLAPSIBLE_SECTION_KEYS.CONFIGURATION] ? 'fa-chevron-down' : 'fa-chevron-up'}`} />
          </button>

          <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.CONFIGURATION] ? 'is-open' : ''}`}>
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
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={handleSave} disabled={!ok}>
            Save Product
          </button>
        </div>
        {pickerOpen && isPackage && (
          <ProductPicker
            products={nonBundleProducts}
            existingProductIds={new Set((f.members || []).map((m) => m.product_id))}
            onAdd={addMember}
            onClose={() => setPickerOpen(false)}
            multiSelect
          />
        )}
      </div>
    </div>
  );
}
