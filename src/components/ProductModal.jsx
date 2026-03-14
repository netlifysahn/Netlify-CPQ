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
  getProductCategory,
  isBundleProduct,
} from '../data/catalog';
import {
  formatIntegerForEdit,
  formatIntegerWithCommas,
  parsePositiveIntegerInput,
} from '../utils/numberFormat';

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

const SEAT_INPUT_PATTERN = /\b(seat|seats|user|users|license|licenses)\b/i;
const CONCURRENT_BUILDS_INPUT_PATTERN = /\bconcurrent\s*builds?\b/i;
const CREDIT_INPUT_PATTERN = /\bcredits?\b/i;

function isSeatLikeProduct(product) {
  if (!product) return false;
  const type = String(product.type || product.category || '').toLowerCase();
  const name = String(product.name || '');
  const sku = String(product.sku || '');
  const unitType = String(product.default_price?.unit || product.unit_type || '').toLowerCase();
  return type === 'seats'
    || unitType === 'per_member'
    || SEAT_INPUT_PATTERN.test(name)
    || SEAT_INPUT_PATTERN.test(sku);
}

function isCreditLikeProduct(product) {
  if (!product) return false;
  const type = String(product.type || product.category || '').toLowerCase();
  const name = String(product.name || '');
  const sku = String(product.sku || '');
  const unitType = String(product.default_price?.unit || product.unit_type || '').toLowerCase();
  return type === 'credits'
    || unitType === 'per_credit'
    || CREDIT_INPUT_PATTERN.test(name)
    || CREDIT_INPUT_PATTERN.test(sku);
}

function isConcurrentBuildsLikeProduct(product) {
  if (!product) return false;
  const name = String(product.name || '');
  const sku = String(product.sku || '');
  return CONCURRENT_BUILDS_INPUT_PATTERN.test(name) || sku === 'CC-B';
}

const COLLAPSIBLE_SECTION_KEYS = {
  BASIC_INFO: 'basicInfo',
  PRICING: 'pricing',
  PACKAGE_COMPONENTS: 'packageComponents',
  SERVICE: 'service',
  ENTITLEMENTS: 'entitlements',
  CONFIGURATION: 'configuration',
  TERMS: 'terms',
};

export default function ProductModal({ product, products, onSave, onClose }) {
  const [f, setF] = useState(coerceProduct(product));
  const [jsonError, setJsonError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creditInputDrafts, setCreditInputDrafts] = useState({});
  const [openSections, setOpenSections] = useState({
    [COLLAPSIBLE_SECTION_KEYS.BASIC_INFO]: true,
    [COLLAPSIBLE_SECTION_KEYS.PRICING]: true,
    [COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS]: true,
    [COLLAPSIBLE_SECTION_KEYS.SERVICE]: true,
    [COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS]: false,
    [COLLAPSIBLE_SECTION_KEYS.CONFIGURATION]: false,
    [COLLAPSIBLE_SECTION_KEYS.TERMS]: false,
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

  const isPackage = isBundleProduct(f) || getProductCategory(f) === 'bundle';
  const isSeatProduct = isSeatLikeProduct(f);
  const isConcurrentBuildsProduct = isConcurrentBuildsLikeProduct(f);
  const isStepperProduct = isSeatProduct || isConcurrentBuildsProduct;
  const isCreditProduct = !isConcurrentBuildsProduct && isCreditLikeProduct(f);
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
        price_behavior: 'included',
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
            <span>{openSections[COLLAPSIBLE_SECTION_KEYS.BASIC_INFO] ? '▾' : '▸'}</span>
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
            <span>{openSections[COLLAPSIBLE_SECTION_KEYS.PRICING] ? '▾' : '▸'}</span>
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
              <span>{openSections[COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS] ? '▾' : '▸'}</span>
            </button>

            <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS] ? 'is-open' : ''}`}>
              <div className="pkg-components">
                {(f.members || []).length > 0 && (
                  <table className="pkg-components-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th style={{ width: 100, minWidth: 100 }}>Qty</th>
                        <th style={{ width: 130, minWidth: 130 }}>Behavior</th>
                        <th style={{ width: 36 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {(f.members || []).map((member, index) => {
                        const referencedProduct = productMap.get(member.product_id);
                        const seatStepperClass = isSeatLikeProduct({
                          ...referencedProduct,
                          ...member,
                          unit_type: member.unit_type || referencedProduct?.default_price?.unit,
                        }) || isConcurrentBuildsLikeProduct({
                          ...referencedProduct,
                          ...member,
                          unit_type: member.unit_type || referencedProduct?.default_price?.unit,
                        }) ? 'number-stepper-seat' : '';
                        const isConcurrentBuildsMember = isConcurrentBuildsLikeProduct({
                          ...referencedProduct,
                          ...member,
                          unit_type: member.unit_type || referencedProduct?.default_price?.unit,
                        });
                        const isCreditMember = !isConcurrentBuildsMember && isCreditLikeProduct({
                          ...referencedProduct,
                          ...member,
                          unit_type: member.unit_type || referencedProduct?.default_price?.unit,
                        });
                        const memberQtyKey = `member:${index}:qty`;
                        const currentQty = parsePositiveIntegerInput(member.qty ?? member.default_quantity, 1, 1);
                        const isEditingCreditQty = Object.prototype.hasOwnProperty.call(creditInputDrafts, memberQtyKey);
                        return (
                          <tr key={`${member.product_id}_${index}`}>
                          <td>{member.name || productMap.get(member.product_id)?.name || 'Unknown'}</td>
                          <td className="cell-sku">{member.sku || productMap.get(member.product_id)?.sku || ''}</td>
                          <td>
                            <input
                              className={`field-input ${seatStepperClass}`.trim()}
                              type={isCreditMember ? 'text' : 'number'}
                              inputMode={isCreditMember ? 'numeric' : undefined}
                              min="1"
                              step="1"
                              value={isCreditMember
                                ? (isEditingCreditQty ? creditInputDrafts[memberQtyKey] : formatIntegerWithCommas(currentQty, 1))
                                : currentQty}
                              onFocus={() => {
                                if (!isCreditMember) return;
                                setCreditInputDrafts((prev) => ({ ...prev, [memberQtyKey]: formatIntegerForEdit(currentQty, 1, 1) }));
                              }}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (isCreditMember) setCreditInputDrafts((prev) => ({ ...prev, [memberQtyKey]: raw }));
                                updateMember(index, 'qty', parsePositiveIntegerInput(raw, 1, 1));
                              }}
                              onBlur={(e) => {
                                if (!isCreditMember) return;
                                updateMember(index, 'qty', parsePositiveIntegerInput(e.target.value, 1, 1));
                                setCreditInputDrafts((prev) => {
                                  const clone = { ...prev };
                                  delete clone[memberQtyKey];
                                  return clone;
                                });
                              }}
                              style={{ width: '100%', padding: '4px 6px', textAlign: 'center' }}
                            />
                          </td>
                          <td>
                            <select
                              className="field-select"
                              value={member.price_behavior || 'included'}
                              onChange={(e) => updateMember(index, 'price_behavior', e.target.value)}
                              style={{ padding: '4px 6px', fontSize: '13px' }}
                            >
                              <option value="included">Included</option>
                              <option value="related">Related</option>
                            </select>
                          </td>
                          <td>
                            <button type="button" className="action-btn delete" onClick={() => removeMember(index)} title="Remove">
                              Remove
                            </button>
                          </td>
                          </tr>
                        );
                      })}
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
            <span>{openSections[COLLAPSIBLE_SECTION_KEYS.SERVICE] ? '▾' : '▸'}</span>
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              Entitlement Rules
              <span
                title="Defines the entitlement behavior for this product — e.g. how credits refresh and over what period. Values entered here are parsed and displayed as tags below the JSON field."
                style={{ fontSize: '13px', color: '#94a3b8', cursor: 'help', fontWeight: 400 }}
              >?</span>
            </span>
            <span>{openSections[COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS] ? '▾' : '▸'}</span>
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
            <span>{openSections[COLLAPSIBLE_SECTION_KEYS.CONFIGURATION] ? '▾' : '▸'}</span>
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
                <input
                  className={`field-input ${isStepperProduct ? 'number-stepper-seat' : ''}`.trim()}
                  type={isCreditProduct ? 'text' : 'number'}
                  inputMode={isCreditProduct ? 'numeric' : undefined}
                  value={isCreditProduct
                    ? (Object.prototype.hasOwnProperty.call(creditInputDrafts, 'config:default_quantity')
                      ? creditInputDrafts['config:default_quantity']
                      : formatIntegerWithCommas(parsePositiveIntegerInput(f.config.default_quantity, 1, 1), 1))
                    : f.config.default_quantity}
                  onFocus={() => {
                    if (!isCreditProduct) return;
                    setCreditInputDrafts((prev) => ({
                      ...prev,
                      'config:default_quantity': formatIntegerForEdit(f.config.default_quantity, 1, 1),
                    }));
                  }}
                  onChange={(e) => {
                    if (!isCreditProduct) {
                      sc('default_quantity', e.target.value);
                      return;
                    }
                    const raw = e.target.value;
                    setCreditInputDrafts((prev) => ({ ...prev, 'config:default_quantity': raw }));
                    sc('default_quantity', parsePositiveIntegerInput(raw, 1, 1));
                  }}
                  onBlur={(e) => {
                    if (!isCreditProduct) return;
                    sc('default_quantity', parsePositiveIntegerInput(e.target.value, 1, 1));
                    setCreditInputDrafts((prev) => {
                      const clone = { ...prev };
                      delete clone['config:default_quantity'];
                      return clone;
                    });
                  }}
                />
              </div>
              <div className="field">
                <label className="field-label">Min Qty</label>
                <input
                  className={`field-input ${isStepperProduct ? 'number-stepper-seat' : ''}`.trim()}
                  type={isCreditProduct ? 'text' : 'number'}
                  inputMode={isCreditProduct ? 'numeric' : undefined}
                  value={isCreditProduct
                    ? (Object.prototype.hasOwnProperty.call(creditInputDrafts, 'config:min_quantity')
                      ? creditInputDrafts['config:min_quantity']
                      : formatIntegerWithCommas(parsePositiveIntegerInput(f.config.min_quantity, 1, 1), 1))
                    : f.config.min_quantity}
                  onFocus={() => {
                    if (!isCreditProduct) return;
                    setCreditInputDrafts((prev) => ({
                      ...prev,
                      'config:min_quantity': formatIntegerForEdit(f.config.min_quantity, 1, 1),
                    }));
                  }}
                  onChange={(e) => {
                    if (!isCreditProduct) {
                      sc('min_quantity', e.target.value);
                      return;
                    }
                    const raw = e.target.value;
                    setCreditInputDrafts((prev) => ({ ...prev, 'config:min_quantity': raw }));
                    sc('min_quantity', parsePositiveIntegerInput(raw, 1, 1));
                  }}
                  onBlur={(e) => {
                    if (!isCreditProduct) return;
                    sc('min_quantity', parsePositiveIntegerInput(e.target.value, 1, 1));
                    setCreditInputDrafts((prev) => {
                      const clone = { ...prev };
                      delete clone['config:min_quantity'];
                      return clone;
                    });
                  }}
                />
              </div>
              <div className="field">
                <label className="field-label">Max Qty</label>
                <input
                  className={`field-input ${isStepperProduct ? 'number-stepper-seat' : ''}`.trim()}
                  type={isCreditProduct ? 'text' : 'number'}
                  inputMode={isCreditProduct ? 'numeric' : undefined}
                  value={isCreditProduct
                    ? (Object.prototype.hasOwnProperty.call(creditInputDrafts, 'config:max_quantity')
                      ? creditInputDrafts['config:max_quantity']
                      : formatIntegerWithCommas(parsePositiveIntegerInput(f.config.max_quantity, 1, 1), 1))
                    : f.config.max_quantity}
                  onFocus={() => {
                    if (!isCreditProduct) return;
                    setCreditInputDrafts((prev) => ({
                      ...prev,
                      'config:max_quantity': formatIntegerForEdit(f.config.max_quantity, 1, 1),
                    }));
                  }}
                  onChange={(e) => {
                    if (!isCreditProduct) {
                      sc('max_quantity', e.target.value);
                      return;
                    }
                    const raw = e.target.value;
                    setCreditInputDrafts((prev) => ({ ...prev, 'config:max_quantity': raw }));
                    sc('max_quantity', parsePositiveIntegerInput(raw, 1, 1));
                  }}
                  onBlur={(e) => {
                    if (!isCreditProduct) return;
                    sc('max_quantity', parsePositiveIntegerInput(e.target.value, 1, 1));
                    setCreditInputDrafts((prev) => {
                      const clone = { ...prev };
                      delete clone['config:max_quantity'];
                      return clone;
                    });
                  }}
                />
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

        {/* ── Terms & Conditions ── */}
        <div className="modal-section">
          <button
            type="button"
            className="modal-section-label modal-section-toggle"
            onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.TERMS)}
            aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.TERMS]}
          >
            <span>Terms &amp; Conditions</span>
            <span>{openSections[COLLAPSIBLE_SECTION_KEYS.TERMS] ? '▾' : '▸'}</span>
          </button>

          <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.TERMS] ? 'is-open' : ''}`}>
            <div className="field">
              <label className="field-label">Product Terms</label>
              <textarea
                className="field-textarea"
                value={f.terms || ''}
                onChange={(e) => s('terms', e.target.value)}
                placeholder="Enter any product-specific terms and conditions that will appear on the quote PDF for this line item..."
                style={{ minHeight: 120 }}
              />
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
