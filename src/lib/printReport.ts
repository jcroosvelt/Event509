const esc = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface ReportSection { title: string; head: string[]; rows: (string | number)[][] }

/** Ouvre un rapport dans une fenêtre prête à imprimer ou à enregistrer en PDF (« Imprimer » → « Enregistrer au format PDF »). */
export function printReport(title: string, subtitle: string, sections: ReportSection[], lang: 'fr' | 'en' = 'fr') {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:system-ui,Arial,sans-serif;max-width:900px;margin:32px auto;padding:0 20px;color:#0B1533}h1{font-size:22px;margin:0}h2{font-size:15px;margin:28px 0 8px}
table{width:100%;border-collapse:collapse;font-size:12px}td,th{padding:6px 8px;border-bottom:1px solid #dde1ea;text-align:left}th{background:#f1f3f8}td.n,th.n{text-align:right}.muted{color:#6E7689;font-size:12px;margin:4px 0 0}
@media print{body{margin:0}}</style></head><body>
<h1>Event509 — ${esc(title)}</h1><p class="muted">${esc(subtitle)}</p>
${sections.map((s) => `<h2>${esc(s.title)}</h2><table><tr>${s.head.map((h, i) => `<th class="${i ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr>${s.rows.map((r) => `<tr>${r.map((v, i) => `<td class="${i ? 'n' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}</table>`).join('')}
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
  if (!w) throw new Error('popup');
}
