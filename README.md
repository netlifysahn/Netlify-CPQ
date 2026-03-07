# Netlify Deal Studio

Internal CPQ (Configure, Price, Quote) tool for Netlify Enterprise Sales.

## Structure

```
src/
  data/catalog.js          — Product data model & constants
  styles/app.css           — Design system CSS
  components/
    NetlifyLogo.jsx        — Netlify Spark logo
    ProductTable.jsx       — Product list table with expandable rows
    ProductModal.jsx       — Add/edit product form (collapsible sections)
    Confirm.jsx            — Delete confirmation dialog
  App.jsx                  — Main app (state, CRUD, sidebar nav)
  main.jsx                 — React entry point
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

- [x] Product Catalog (Phase 1 data model)
- [ ] Pricebooks
- [ ] Quote Builder
- [ ] Order Summary & Approval Flow
