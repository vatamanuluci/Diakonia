# Diakonia · Datele bisericii

Dashboard static în limba română, pregătit pentru Netlify.

## Publicare

- Public directory: `dist`
- Build command: none
- Entry page: `dist/index.html`

Conectează repository-ul Git la Netlify și selectează setările de mai sus. Pagina încarcă `dist/data.json` pentru listele și indicatorii detaliați. Fișierul conține date personale și este exclus din Git; versiunea locală funcționează când fișierul este prezent. Nu publica un export complet pe Netlify fără aprobarea explicită a destinației și a categoriilor de date.

## Sursa metricilor

Exportul local include foile din `Diakonia.xlsx`, cu datele de identificare și contact păstrate pentru dashboardul localhost. Fișierul Excel sursă nu este inclus în repository.
