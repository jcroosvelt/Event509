// Exports côté client. Le backend pourra plus tard générer ces fichiers côté serveur.

type Row = Record<string, string | number | boolean | undefined | null>;

function download(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCSV(rows: Row[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
  // BOM pour qu'Excel lise correctement les accents
  download('﻿' + csv, filename.endsWith('.csv') ? filename : `${filename}.csv`, 'text/csv;charset=utf-8');
}

/** Classeur Excel au format SpreadsheetML 2003 (s'ouvre nativement dans Excel). */
export function exportExcel(rows: Row[], filename: string, sheet = 'Participants') {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const x = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cell = (v: unknown) =>
    typeof v === 'number'
      ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>`
      : `<Cell><Data ss:Type="String">${x(v)}</Data></Cell>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>
<Worksheet ss:Name="${x(sheet)}"><Table>
<Row>${headers.map((h) => `<Cell ss:StyleID="h"><Data ss:Type="String">${x(h)}</Data></Cell>`).join('')}</Row>
${rows.map((r) => `<Row>${headers.map((h) => cell(r[h])).join('')}</Row>`).join('\n')}
</Table></Worksheet></Workbook>`;
  download(xml, filename.endsWith('.xls') ? filename : `${filename}.xls`, 'application/vnd.ms-excel');
}

export function downloadICS(opts: { title: string; start: string; end: string; location?: string; description?: string }) {
  const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Event509//FR', 'BEGIN:VEVENT',
    `UID:${Date.now()}@event509`, `DTSTAMP:${f(new Date().toISOString())}`,
    `DTSTART:${f(opts.start)}`, `DTEND:${f(opts.end)}`, `SUMMARY:${opts.title}`,
    opts.location ? `LOCATION:${opts.location}` : '',
    opts.description ? `DESCRIPTION:${opts.description.slice(0, 200).replace(/\n/g, ' ')}` : '',
    'BEGIN:VALARM', 'TRIGGER:-PT24H', 'ACTION:DISPLAY', 'DESCRIPTION:Rappel Event509', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  download(ics, 'event509.ics', 'text/calendar');
}
