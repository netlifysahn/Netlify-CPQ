import { fmtCurrency, getEffectiveLineQuantity } from '../data/quotes';
import { isRichTextEmpty, toRichTextHtml } from './richText';

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtQty(n) { return n == null ? '' : Number(n).toLocaleString('en-US'); }
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function hasLineDiscount(lines) {
  return lines.some(l => l.list_price != null && l.net_price != null && l.net_price < l.list_price);
}
const EXHIBIT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function toExhibitLabel(i) {
  let n=i,s=''; while(n>=0){s=EXHIBIT_CHARS[n%26]+s;n=Math.floor(n/26)-1;} return `Exhibit ${s}`;
}
function collectLineTermExhibits(lines=[]) {
  const exhibitEntries=[],exhibitByLineId=new Map(),exhibitByLineRef=new Map();
  lines.forEach(line=>{
    const termsHtml=toRichTextHtml(line?.terms||'');
    if(isRichTextEmpty(termsHtml))return;
    const exhibitLabel=toExhibitLabel(exhibitEntries.length);
    const entry={line,exhibitLabel,productName:line?.product_name||'Product',termsHtml};
    exhibitEntries.push(entry);
    if(line?.id)exhibitByLineId.set(line.id,exhibitLabel);
    exhibitByLineRef.set(line,exhibitLabel);
  });
  return{exhibitEntries,exhibitByLineId,exhibitByLineRef};
}

function buildQuoteHTML(quote, settings, logoB64) {
  const allLines = quote.line_items || [];
  const { exhibitEntries, exhibitByLineId, exhibitByLineRef } = collectLineTermExhibits(allLines);
  const getLineExhibit = line => {
    if(!line)return'';
    return(line.id&&exhibitByLineId.get(line.id))||exhibitByLineRef.get(line)||'';
  };
  const getLineLabel = (line,fallback=line?.product_name||'Product') => {
    const ex=getLineExhibit(line);
    return ex?`${esc(fallback)} <span class="ex-ref">(${esc(ex)})</span>`:esc(fallback);
  };

  const logoHtml = logoB64
    ? `<img src="data:image/png;base64,${logoB64}" class="logo" alt="Netlify">`
    : `<span class="logo-fallback">netlify</span>`;

  // TOTALS MATH
  const priceable = allLines.filter(l => l.parent_line_id ? l.price_behavior==='related' : true);
  const listTotal = priceable.reduce((s,l)=>{
    const qty=getEffectiveLineQuantity(l),list=l.list_price??0;
    const isCred=l.product_type==='credits'&&l.unit_type==='per_credit';
    return s+(isCred?list*qty:list*qty*12);
  },0);
  const netTotal = priceable.reduce((s,l)=>{
    const qty=getEffectiveLineQuantity(l),net=l.net_price??l.list_price??0;
    const isCred=l.product_type==='credits'&&l.unit_type==='per_credit';
    return s+(isCred?net*qty:net*qty*12);
  },0);
  const headerDiscPct=quote.header_discount||0;
  const headerDiscAmt=netTotal*(headerDiscPct/100);
  const finalACV=netTotal-headerDiscAmt;
  const lineDiscAmt=listTotal-netTotal;
  const totalDisc=lineDiscAmt+headerDiscAmt;
  const hasDiscount=totalDisc>0.01;

  // SECTION RENDERER
  const renderSection = (label, lines) => {
    if(!lines.length)return'';
    const showDisc=hasLineDiscount(lines);
    const isEnt=!['Support','Platform Add-Ons'].includes(label);
    let headCols,rows;
    if(!isEnt){
      headCols=showDisc?['','List Price','Disc. Monthly','Disc. Annual']:['','Monthly','Annual'];
      rows=lines.map(l=>{
        const list=l.list_price??0,net=l.net_price??list;
        return{
          cells:showDisc?[getLineLabel(l),fmtCurrency(list),fmtCurrency(net),fmtCurrency(net*12)]:[getLineLabel(l),fmtCurrency(net),fmtCurrency(net*12)],
          features:Array.isArray(l.features)?l.features:[]
        };
      });
    } else {
      // Entitlements: Qty / Unit Price / Monthly / Annual
      headCols=['','Qty','Unit Price','Monthly','Annual'];
      rows=lines.map(l=>{
        const qty=getEffectiveLineQuantity(l),net=l.net_price??l.list_price??0;
        const isCred=l.product_type==='credits'&&l.unit_type==='per_credit';
        const monthly=isCred?net*qty:net*qty;
        const annual=isCred?net*qty:net*qty*12;
        return{
          cells:[getLineLabel(l),fmtQty(qty),fmtCurrency(net),fmtCurrency(monthly),fmtCurrency(annual)],
          features:Array.isArray(l.features)?l.features:[]
        };
      });
    }
    const colCount=headCols.length;
    return `
<div class="section">
  <div class="section-label">${esc(label)}</div>
  <table class="data-table">
    <thead><tr>${headCols.map((h,i)=>`<th class="${i===0?'td-name':i===1&&isEnt?'td-num-sm':'td-num'}">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.map(row=>`
        <tr>${row.cells.map((c,i)=>`<td class="${i===0?'td-name':i===1&&isEnt?'td-num-sm':'td-num'}${i===0?' line-bold':''}">${i===0?c:esc(c)}</td>`).join('')}</tr>
        ${row.features.map(f=>`<tr class="feat-row"><td class="feat-cell" colspan="${colCount}">${esc(f)}</td></tr>`).join('')}
      `).join('')}
    </tbody>
  </table>
</div>`;
  };

  // BASE PACKAGE
  const packageLines=allLines.filter(l=>l.is_package);
  const basePkgHtml=packageLines.length?`
<div class="section">
  ${packageLines.map(pkg=>{
    const subs=allLines.filter(l=>l.parent_line_id===pkg.id);
    const monthly=pkg.net_price??pkg.list_price??0;
    const annual=monthly*12;
    return`<table class="data-table">
    <thead><tr>
      <th class="td-name section-label" style="padding-bottom:8px">Base Package</th>
      <th class="td-num" style="font-size:7pt">Monthly</th>
      <th class="td-num" style="font-size:7pt">Annual</th>
    </tr></thead>
    <tbody>
      <tr class="pkg-name-row">
        <td class="td-name"><span class="pkg-title">${getLineLabel(pkg)}</span></td>
        <td class="td-num pkg-price">${fmtCurrency(monthly)}</td>
        <td class="td-num pkg-price">${fmtCurrency(annual)}</td>
      </tr>
      <tr><td class="included-label" colspan="3">Included</td></tr>
      ${(() => {
        const order = ['platform','addon','support','credits','entitlements','seats'];
        const sorted = [...subs].sort((a,b) => {
          const ai = order.indexOf(a.product_type); const bi = order.indexOf(b.product_type);
          return (ai===-1?99:ai) - (bi===-1?99:bi);
        });
        return sorted.map(s=>{
          const qty=getEffectiveLineQuantity(s);
          const name=esc(s.product_name||'Product');
          const qtyRow=qty>1?`<tr class="included-row"><td colspan="3" class="included-qty">${fmtQty(qty)}</td></tr>`:'';
          return`<tr class="included-row"><td colspan="3" class="included-item">${name}</td></tr>${qtyRow}`;
        }).join('');
      })()}
    </tbody>
  </table>`;
  }).join('')}
</div>`:'';

  // OVERAGE
  const overageRows=[];
  const seen=new Set();
  allLines.filter(l=>['seats','credits','entitlements'].includes(l.product_type)).forEach(l=>{
    const key=l.product_type==='seats'?'Enterprise Seats':l.product_type==='credits'?'Credits':l.product_name;
    if(seen.has(key))return;seen.add(key);
    let overage='—';
    if(l.product_type==='seats'&&quote.overage_rate_seats)overage=quote.overage_rate_seats;
    if(l.product_type==='credits'&&quote.overage_rate_credits)overage=quote.overage_rate_credits;
    overageRows.push([key,fmtQty(l.quantity),overage]);
  });
  const overageHtml=overageRows.length?`
<div class="section">
  <div class="section-label">Consumption Limits &amp; Overage Rates</div>
  <table class="data-table">
    <thead><tr><th class="td-name"></th><th class="td-num">Included</th><th class="td-num">Overage Rate</th></tr></thead>
    <tbody>${overageRows.map(([n,q,r])=>`<tr><td class="td-name">${esc(n)}</td><td class="td-num">${esc(q)}</td><td class="td-num">${esc(r)}</td></tr>`).join('')}</tbody>
  </table>
</div>`:'';

  const ofHtml=toRichTextHtml(settings?.orderFormHeaderText||'');
  const orderFormText=!isRichTextEmpty(ofHtml)?`<div class="of-text">${ofHtml}</div>`:'';

  const standaloneSupport=allLines.filter(l=>!l.parent_line_id&&!l.is_package&&l.product_type==='support');
  const standaloneAddons=allLines.filter(l=>!l.parent_line_id&&!l.is_package&&l.product_type==='addon');
  const standaloneEnt=allLines.filter(l=>!l.parent_line_id&&!l.is_package&&['entitlements','seats','credits'].includes(l.product_type));

  // TERMS
  const hasTerms=exhibitEntries.length>0||quote.terms_conditions?.trim();
  const termsHtml=hasTerms?`
<div class="page-break"></div>
<div class="terms-wrap">
  <h2 class="terms-title">Terms &amp; Conditions</h2>
  <div class="thick-rule"></div>
  ${quote.terms_conditions?.trim()?`<h3 class="terms-h3">Additional Terms</h3><div class="terms-body">${toRichTextHtml(quote.terms_conditions.trim())}</div>`:''}
  ${exhibitEntries.map(e=>`<h3 class="terms-h3 exhibit-h3">${esc(e.exhibitLabel)} — ${esc(e.productName)}</h3><div class="terms-body">${e.termsHtml}</div>`).join('')}
  ${quote.quote_type==='order_form'?`
  <div class="sig-block">
    <h2 class="sig-title">Signature</h2>
    <p class="sig-note">Your signature of this Order Form constitutes your agreement and consent to all terms referenced in this Order Form.</p>
    <div class="sig-grid">
      ${['Customer','Netlify, Inc.'].map(party=>`
      <div class="sig-col">
        <div class="sig-party">${esc(party)}</div>
        ${['Signature','Print Name','Title','Date'].map(f=>`
        <div class="sig-field"><span class="sig-label">${esc(f)}</span><span class="sig-line"></span></div>`).join('')}
      </div>`).join('')}
    </div>
  </div>`:''}
</div>`:'';

  const isDraft=quote.status==='draft'||quote.status==='draft_revision';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(quote.quote_number||'Quote')} — ${esc(quote.customer_name||'')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Mulish:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:10pt}
body{font-family:'Mulish',sans-serif;color:#1a1a2e;background:#fff;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}

.print-bar{position:fixed;top:0;left:0;right:0;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 40px;display:flex;align-items:center;justify-content:space-between;z-index:999}
.print-tip{font-size:7.5pt;color:#9ca3af;font-family:'Mulish',sans-serif}
.btn-save{background:#00ad9f;color:#fff;border:none;border-radius:5px;padding:7px 20px;font-size:9pt;font-weight:600;cursor:pointer;font-family:'Poppins',sans-serif}
.btn-save:hover{background:#009e91}

.page{max-width:740px;margin:0 auto;padding:68px 52px 64px}

@media print{
  @page{margin:14mm 16mm 14mm;size:A4}
  .print-bar{display:none!important}
  .page{padding:0;max-width:100%}
  .page-break{page-break-before:always}
  body{font-size:9pt}
}

.draft-bg{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:100pt;font-weight:800;color:rgba(0,0,0,.03);pointer-events:none;z-index:0;font-family:'Poppins',sans-serif}

/* HEADER */
.doc-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
.logo{height:28px;width:auto}
.logo-fallback{font-size:14pt;font-weight:700;font-family:'Poppins',sans-serif}
.partner-tag{font-size:8pt;color:#9ca3af;margin-left:10px}
.header-right{text-align:right}
.qnum{font-size:9pt;color:#9ca3af;letter-spacing:.03em;display:block;margin-bottom:6px}
.header-meta{font-size:8.5pt;color:#6b7280;line-height:1.5;text-align:right}

/* ONE thin rule — only below header */
.h-rule{border:none;border-top:1px solid #e5e7eb;margin:0 0 22px}

/* CUSTOMER BLOCK — 2 col */
.customer-block{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start;margin-bottom:0}
.customer-name{font-family:'Poppins',sans-serif;font-size:13pt;font-weight:700;color:#0a0a0a;letter-spacing:-.02em;line-height:1.2;margin-bottom:3px}
.customer-address{font-size:8.5pt;color:#9ca3af;line-height:1.5}
.pc-label{font-size:6pt;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;display:block}
.pc-name{font-size:9.5pt;color:#1a1a2e;font-weight:600;display:block;margin-bottom:2px}
.pc-email{font-size:8.5pt;color:#6b7280;display:block}

/* BILLING META — no top border, just padding */
.billing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:20px 0 0;margin-top:20px;border-top:none}
.bcol-label{font-size:6pt;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}
.bcol-line{font-size:9pt;color:#374151;line-height:1.85}

/* LINE SECTIONS */
.section-divider{border:none;border-top:1px solid #e5e7eb;margin:24px 0}
.section{margin-bottom:28px}
.section-label{font-size:7pt;color:#9ca3af;text-transform:uppercase;letter-spacing:.09em;margin-bottom:8px}
.section-header-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
.section-header-cols{display:flex;gap:0}
.section-header-col{font-size:7pt;color:#9ca3af;text-transform:uppercase;letter-spacing:.09em;width:110px;text-align:right}

/* DATA TABLE — consistent column widths across all sections */
.data-table{width:100%;border-collapse:collapse;font-size:9.5pt}
.data-table thead tr{border-bottom:1px solid #e5e7eb}
.data-table th{font-size:6pt;font-weight:400;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;padding:0 8px 8px}
.td-name{text-align:left;padding-left:0!important;width:auto}
.td-num{text-align:right;white-space:nowrap;width:110px}
.td-num-sm{text-align:right;white-space:nowrap;width:72px}
.data-table tbody tr{border-top:1px solid #f3f4f6}
.data-table tbody tr:first-child{border-top:none}
.data-table td{padding:9px 8px;color:#374151;vertical-align:top}
.data-table td.td-name{padding-left:0}
.line-bold{font-family:'Poppins',sans-serif;font-weight:600;color:#0a0a0a}

/* BASE PACKAGE */
.pkg-title{font-family:'Poppins',sans-serif;font-size:11pt;font-weight:600;color:#0a0a0a;letter-spacing:-.01em}
.pkg-price{font-size:9.5pt;font-weight:400;color:#374151;font-family:'Mulish',sans-serif}
.pkg-name-row td{padding-top:12px;padding-bottom:6px}
.included-label{font-size:6pt;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;padding:4px 0 2px!important;border-top:none!important}
.included-row td{border-top:none!important;padding:2.5px 0 2.5px 10px}
.included-item{font-size:9pt;color:#4b5563}
.included-qty{font-size:9pt;color:#9ca3af;padding:0 0 4px 10px!important}
.qty-muted{color:#9ca3af;margin-left:4px}
.ex-ref{color:#9ca3af;font-size:.85em}
.feat-row td{font-size:8pt;color:#9ca3af;padding:1px 8px 1px 20px;border-top:none!important}
.feat-cell{text-align:left!important;padding-left:20px!important}

.of-text{font-size:8.5pt;color:#6b7280;line-height:1.7;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #e5e7eb}
.of-text p{margin-bottom:6px}

/* TOTALS */
.totals-wrap{display:flex;justify-content:flex-end;margin-top:8px;margin-bottom:8px}
.totals-inner{width:310px}
.totals-table{width:100%;border-collapse:collapse}
.totals-table td{padding:5px 0}
.t-label{color:#6b7280;font-size:9pt}
.t-value{text-align:right;color:#374151;font-size:9pt}
.t-disc .t-label,.t-disc .t-value{color:#9ca3af}
.t-acv{border-top:1px solid #e5e7eb}
.t-acv td{padding-top:14px}
.t-acv .t-label{font-size:6pt;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;vertical-align:top;padding-top:16px}
.t-acv .t-value{font-family:'Poppins',sans-serif;font-size:26pt;font-weight:700;color:#0a0a0a;letter-spacing:-.03em;line-height:1}
.mo-equiv{font-size:8pt;color:#9ca3af;text-align:right;margin-top:5px}
.term-badge{font-size:7pt;color:#f59e0b;text-align:right;margin-top:4px;text-transform:uppercase;letter-spacing:.06em}
.disclaimer{font-size:7pt;color:#d1d5db;margin-top:20px;line-height:1.6}

/* TERMS */
.terms-wrap{padding-top:4px}
.terms-title{font-family:'Poppins',sans-serif;font-size:17pt;font-weight:700;color:#0a0a0a;letter-spacing:-.02em;margin-bottom:10px}
.thick-rule{border:none;border-top:1.5px solid #111;margin-bottom:24px}
.terms-h3{font-family:'Poppins',sans-serif;font-size:10pt;font-weight:600;color:#111;margin-top:24px;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid #f3f4f6}
.exhibit-h3{margin-top:36px}
.terms-body{font-size:9pt;color:#374151;line-height:1.7}
.terms-body p{margin-bottom:8px}
.terms-body>ol,.terms-body>ul{padding-left:20px;margin-bottom:8px}
.terms-body ol ol,.terms-body ul ul{padding-left:18px;margin-top:3px;margin-bottom:3px}
.terms-body li{margin-bottom:4px}
.terms-body ol{list-style-type:decimal}
.terms-body ol ol{list-style-type:lower-alpha}
.terms-body ol ol ol{list-style-type:lower-roman}

/* SIGNATURE */
.sig-block{margin-top:48px}
.sig-title{font-family:'Poppins',sans-serif;font-size:15pt;font-weight:700;color:#0a0a0a;letter-spacing:-.02em;margin-bottom:6px}
.sig-note{font-size:8.5pt;color:#6b7280;margin-bottom:28px;line-height:1.5;max-width:540px}
.sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px}
.sig-party{font-family:'Poppins',sans-serif;font-size:10.5pt;font-weight:600;color:#0a0a0a;margin-bottom:22px}
.sig-field{display:flex;align-items:flex-end;gap:10px;margin-bottom:22px}
.sig-label{font-size:8pt;color:#9ca3af;white-space:nowrap;min-width:72px}
.sig-line{flex:1;border-bottom:1px solid #d1d5db;height:16px}
</style>
</head>
<body>

<div class="print-bar">
  <span class="print-tip">When saving: Margins → None · uncheck Headers and Footers</span>
  <button class="btn-save" onclick="window.print()">Save as PDF</button>
</div>

${isDraft?'<div class="draft-bg">DRAFT</div>':''}

<div class="page">

  <div class="doc-header">
    <div style="display:flex;align-items:center">
      ${logoHtml}
      ${quote.partner_name?`<span class="partner-tag">× ${esc(quote.partner_name)}</span>`:''}
    </div>
    <div class="header-right">
      <span class="qnum">${esc((quote.quote_number||'').replace('QUO-','QUOTE - '))}</span>
      <div class="header-meta">${[
        quote.prepared_by&&`Prepared by ${esc(quote.prepared_by)}`,
        quote.start_date&&`Quote Date: ${fmtDate(quote.start_date)}`,
        quote.expiration_date&&`Quote Expiration Date: ${fmtDate(quote.expiration_date)}`,
      ].filter(Boolean).join('<br>')}</div>
    </div>
  </div>

  <hr class="h-rule">

  <div class="customer-block">
    <div>
      <div class="customer-name">${esc(quote.customer_name||'')}</div>
      ${quote.address?`<div class="customer-address">${esc(quote.address)}</div>`:''}
    </div>
    <div>
      ${quote.contact_name?`<span class="pc-label">Primary Contact</span><span class="pc-name">${esc(quote.contact_name)}</span>`:''}
      ${quote.contact_email?`<span class="pc-email">${esc(quote.contact_email)}</span>`:''}
    </div>
  </div>

  <div class="billing-grid">
    ${[
      {label:'Billing Contact',lines:[quote.billing_contact_name,quote.billing_contact_email,quote.billing_contact_phone,quote.invoice_email?`Invoice: ${quote.invoice_email}`:null].filter(Boolean)},
      {label:'Payment Terms',lines:[quote.payment_terms?`Payment: ${quote.payment_terms}`:null,quote.billing_schedule?`Billing: ${quote.billing_schedule}`:null,quote.payment_method?`Method: ${quote.payment_method}`:null].filter(Boolean)},
      {label:'Subscription',lines:[quote.start_date?`Start: ${fmtDate(quote.start_date)}`:null,quote.term_months?`Term: ${quote.term_months} Months`:null,quote.account_id?`Account: ${quote.account_id}`:null].filter(Boolean)},
    ].map(col=>col.lines.length?`<div><div class="bcol-label">${esc(col.label)}</div>${col.lines.map(l=>`<div class="bcol-line">${esc(l)}</div>`).join('')}</div>`:'').join('')}
  </div>

  <hr class="section-divider">

  ${orderFormText}
  ${basePkgHtml}
  ${renderSection('Support',standaloneSupport)}
  ${renderSection('Platform Add-Ons',standaloneAddons)}
  ${renderSection('Additional Entitlements',standaloneEnt)}
  ${overageHtml}

  <hr class="section-divider">

  <div class="totals-wrap">
    <div class="totals-inner">
      <table class="totals-table">
        <tbody>
          ${hasDiscount?`
          <tr><td class="t-label">Total Annual List Price</td><td class="t-value">${fmtCurrency(listTotal)}</td></tr>
          <tr class="t-disc"><td class="t-label">${headerDiscPct>0?`Discount (${headerDiscPct}%)`:'Discount'}</td><td class="t-value">–${fmtCurrency(totalDisc)}</td></tr>`:''}
          <tr class="t-acv">
            <td class="t-label">Net Annual Fees</td>
            <td class="t-value">${fmtCurrency(finalACV)}</td>
          </tr>
        </tbody>
      </table>
      <div class="mo-equiv">${fmtCurrency(finalACV/12)} / month</div>
      ${(quote.term_months||12)>12?`<div class="term-badge">${quote.term_months}-Month Term</div>`:''}
    </div>
  </div>

  <p class="disclaimer">All prices are quoted in USD and are exclusive of any applicable taxes, commissions, import duties, or other similar fees.</p>

  ${termsHtml}

</div>
</body>
</html>`;
}

export async function generateQuotePDF(quote, products, settings, { preview = false } = {}) {
  const { NETLIFY_LOGO_B64 } = await import('../assets/netlifyLogo.js').catch(() => ({ NETLIFY_LOGO_B64: null }));
  const html = buildQuoteHTML(quote, settings, NETLIFY_LOGO_B64);
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    win.addEventListener('beforeunload', () => URL.revokeObjectURL(url), { once: true });
  } else {
    const a = document.createElement('a');
    a.href = url; a.download = `${quote.quote_number||'quote'}.html`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
