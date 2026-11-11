# Diakonia — dashboardul bisericii

Dashboard static în limba română, publicat automat cu GitHub Pages.

## Publicare automată

Workflow-ul din `.github/workflows/pages.yml` publică automat conținutul din `dist/` după fiecare push pe `main`. Pentru prima publicare, activează GitHub Pages din **Settings → Pages → Build and deployment → Source: GitHub Actions**. Linkul site-ului apare în setările Pages și în rezultatul workflow-ului.

## Date

`dist/data.json` include exportul tuturor foilor din `Diakonia.xlsx` și este consumat de dashboard. Actualizează workbook-ul, rulează `node sync-data.js`, apoi include modificarea `dist/data.json` în commit și push. Fișierul Excel original rămâne exclus din Git.

**Atenție:** GitHub Pages este public pe internet, chiar dacă repository-ul este privat. Datele din `dist/data.json` pot fi citite și descărcate de oricine are acces la site. Nu include date pe care biserica nu dorește să le publice.
