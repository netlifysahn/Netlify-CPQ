# Netlify CPQ — Product Catalog

Internal CPQ (Configure, Price, Quote) tool for Netlify Enterprise Sales.

## Structure

```
src/
  data/catalog.js        — Product seed data & constants
  styles/theme.js        — Design tokens & shared styles
  components/
    Icons.jsx            — SVG icon components
    ProductTable.jsx     — Product list table
    ProductModal.jsx     — Add/edit product form
    BundleList.jsx       — Bundle card list
    BundleModal.jsx      — Create/edit bundle form
    Confirm.jsx          — Delete confirmation dialog
  App.jsx                — Main app (state, CRUD, routing)
  main.jsx               — React entry point
```

## Setup

```bash
npm install
npm run dev
```

## Deploy to Netlify

Connect the GitHub repo to Netlify. Build settings are in `netlify.toml`:
- Build command: `npm run build`
- Publish directory: `dist`

## Roadmap

- [ ] Product Catalog (Products + Bundles) ✅
- [ ] Quote Builder (bundle or à la carte line items)
- [ ] Order Summary & Approval Flow
- [ ] Deal Desk Integration
- [ ] Netlify Blobs persistence
