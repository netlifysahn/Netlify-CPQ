import React, { useMemo, useState } from 'react';
import {
  BUNDLE_PRICING_MODES,
  MEMBER_PRICE_BEHAVIORS,
  PRICE_UNITS,
  PRICING_METHODS,
  PRODUCT_TYPES,
  TERM_BEHAVIORS,
  TYPE_LABELS,
  UNIT_LABELS,
  calcBundleMembersTotal,
  calcBundleMonthlyTotal,
  emptyBundleMember,
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
  const bundleMembers = useMemo(
    () =>
      (f.members || [])
        .map((member, index) => ({ member, index }))
        .sort((a, b) => (a.member.sort_order || 0) - (b.member.sort_order || 0)),
    [f.members],
  );

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
    const nextSort = (f.members || []).length + 1;
    setF((prev) => ({
      ...prev,
      members: [...(prev.members || []), { ...emptyBundleMember(productId), sort_order: nextSort }],
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

  const bundleMembersTotal = calcBundleMembersTotal(f, productMap);
  const bundleMonthlyTotal = calcBundleMonthlyTotal(f, productMap);

  const handleSave = () => {
    if (!ok) return;

    let entitlements = f.default_entitlements;
    try {
      if (typeof entitlements === 'string') JSON.parse(entitlements);
    } catch {
      entitlements = '{}';
    }

    const normalizedMembers = (f.members || [])
      .map((member, index) => ({
        ...member,
        required: Boolean(member.required),
        default_quantity: Math.max(0, parseNumber(member.default_quantity, 1)),
        quantity_editable: Boolean(member.quantity_editable),
        sort_order: parseInt(member.sort_order, 10) || index + 1,
        discount_percent: Math.max(0, Math.min(100, parseNumber(member.discount_percent, 0))),
      }))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((member, index) => ({ ...member, sort_order: index + 1 }));

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
                  s('category', e.target.value);
                  s('type', e.target.value);
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

        <div className="modal-section">
          <div className="modal-section-label">
            <i className="fa-solid fa-boxes-stacked" />
            Package Configuration
          </div>

          <div className="checkbox-row">
            <input
              type="checkbox"
              checked={isBundleProduct(f)}
              onChange={(e) => s('configuration_method', e.target.checked ? 'bundle' : 'none')}
              id="isBundle"
            />
            <label htmlFor="isBundle" className="checkbox-label">This is a package</label>
          </div>

          {isBundleProduct(f) && (
            <>
              <div className="grid-2">
                <div className="field">
                  <label className="field-label">Package Pricing</label>
                  <select className="field-select" value={f.bundle_pricing} onChange={(e) => s('bundle_pricing', e.target.value)}>
                    {BUNDLE_PRICING_MODES.map((mode) => (
                      <option key={mode} value={mode}>{mode}</option>
                    ))}
                  </select>
                </div>
                <div className="checkbox-row checkbox-row-offset">
                  <input type="checkbox" checked={f.print_members} onChange={(e) => s('print_members', e.target.checked)} id="printMembers" />
                  <label htmlFor="printMembers" className="checkbox-label">Print members on quote docs</label>
                </div>
              </div>

              <div className="field">
                <label className="field-label">Members</label>
                <div className="bundle-picker-wrap">
                  <button type="button" className="btn-secondary bundle-add-btn" onClick={() => setPickerOpen((prev) => !prev)}>
                    <i className="fa-solid fa-plus" />
                    Add Member
                  </button>

                  {pickerOpen && (
                    <div className="bundle-picker">
                      <input
                        className="field-input bundle-picker-search"
                        value={memberQuery}
                        onChange={(e) => setMemberQuery(e.target.value)}
                        placeholder="Search non-package products..."
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

                <div className="bundle-members-list">
                  {bundleMembers.length === 0 && <div className="bundle-members-empty">No members added.</div>}
                  {bundleMembers.map(({ member, index }) => {
                    const memberProduct = productMap.get(member.product_id);
                    return (
                      <div key={`${member.product_id}_${index}`} className="bundle-member-editor">
                        <div className="bundle-member-head">
                          <div className="bundle-member-title">{memberProduct ? memberProduct.name : 'Unknown product'}</div>
                          <button type="button" className="action-btn delete" onClick={() => removeMember(index)}>
                            <i className="fa-solid fa-trash-can" />
                          </button>
                        </div>

                        <div className="grid-4 bundle-member-grid">
                          <div className="field">
                            <label className="field-label">Quantity</label>
                            <input
                              className="field-input"
                              type="number"
                              min="0"
                              step="1"
                              value={member.default_quantity}
                              onChange={(e) => updateMember(index, 'default_quantity', e.target.value)}
                            />
                          </div>
                          <div className="field">
                            <label className="field-label">Sort</label>
                            <input
                              className="field-input"
                              type="number"
                              min="1"
                              step="1"
                              value={member.sort_order}
                              onChange={(e) => updateMember(index, 'sort_order', e.target.value)}
                            />
                          </div>
                          <div className="field">
                            <label className="field-label">Price Behavior</label>
                            <select
                              className="field-select"
                              value={member.price_behavior}
                              onChange={(e) => updateMember(index, 'price_behavior', e.target.value)}
                            >
                              {MEMBER_PRICE_BEHAVIORS.map((behavior) => (
                                <option key={behavior} value={behavior}>{behavior}</option>
                              ))}
                            </select>
                          </div>
                          {member.price_behavior === 'discounted' ? (
                            <div className="field">
                              <label className="field-label">Discount %</label>
                              <input
                                className="field-input"
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={member.discount_percent}
                                onChange={(e) => updateMember(index, 'discount_percent', e.target.value)}
                              />
                            </div>
                          ) : (
                            <div className="field">
                              <label className="field-label">Discount %</label>
                              <input className="field-input" type="number" value="0" disabled />
                            </div>
                          )}
                        </div>

                        <div className="grid-2">
                          <div className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={!!member.required}
                              onChange={(e) => updateMember(index, 'required', e.target.checked)}
                              id={`required_${member.product_id}_${member.sort_order}`}
                            />
                            <label htmlFor={`required_${member.product_id}_${member.sort_order}`} className="checkbox-label">Required</label>
                          </div>
                          <div className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={!!member.quantity_editable}
                              onChange={(e) => updateMember(index, 'quantity_editable', e.target.checked)}
                              id={`editable_${member.product_id}_${member.sort_order}`}
                            />
                            <label htmlFor={`editable_${member.product_id}_${member.sort_order}`} className="checkbox-label">Quantity editable</label>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bundle-rollup">
                <div className="bundle-rollup-line">
                  <span>Header price</span>
                  <span>{fmtPrice(parseNumber(f.default_price.amount))}</span>
                </div>
                <div className="bundle-rollup-line">
                  <span>Members subtotal</span>
                  <span>{fmtPrice(bundleMembersTotal)}</span>
                </div>
                <div className="bundle-rollup-line bundle-rollup-total">
                  <span>Monthly total ({f.bundle_pricing})</span>
                  <span>{fmtPrice(bundleMonthlyTotal)}</span>
                </div>
              </div>
            </>
          )}
        </div>

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
