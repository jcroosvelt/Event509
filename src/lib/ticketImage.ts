/**
 * Image du billet en ultra haute définition (3840 × 1400 px), au style d'un billet de spectacle :
 * grand bloc coloré avec le titre à gauche, informations au centre, souche blanche avec le QR code à droite.
 * Le QR code est dessiné pixel pour pixel (net à l'impression comme à l'écran).
 */
export interface TicketImageOpts {
  title: string;
  ticketName: string;
  /** Date lisible (« samedi 14 mars 2026 ») et heure (« 20:00 »). */
  dateLong: string;
  time: string;
  /** Séance choisie, pour un événement à plusieurs séances. */
  session?: string;
  venueName: string;
  address: string;
  city: string;
  holder: string;
  seat?: string;
  /** Prix lisible (« 500 HTG », « Gratuit »). */
  price: string;
  code: string;
  labels: { ticket: string; date: string; time: string; venue: string; seat: string; holder: string; session: string; scan: string };
}

const W = 1920;
const H = 700;
const SCALE = 2; // 3840 × 1400
const NAVY = '#0B1533';
const BLUE = '#1F5EFF';
const FONT = '"Plus Jakarta Sans Variable", system-ui, sans-serif';

export async function renderTicketBlob(o: TicketImageOpts): Promise<Blob> {
  // Les polices doivent être chargées avant de dessiner dans le canvas
  try {
    await Promise.all(['500', '700', '800'].map((w) => document.fonts.load(`${w} 40px ${FONT}`)));
  } catch {
    /* police système en secours */
  }
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'alphabetic';

  // Fond et ombre
  ctx.fillStyle = '#E9ECF3';
  ctx.fillRect(0, 0, W, H);
  const x0 = 40, y0 = 40, w = W - 80, h = H - 80;
  ctx.save();
  ctx.shadowColor = 'rgba(11,21,51,0.28)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#FFFFFF';
  rr(ctx, x0, y0, w, h, 28);
  ctx.fill();
  ctx.restore();

  // Tout ce qui suit est découpé aux coins arrondis du billet
  ctx.save();
  rr(ctx, x0, y0, w, h, 28);
  ctx.clip();

  const leftEnd = x0 + w * 0.5; // bord du grand bloc
  const midEnd = x0 + w * 0.69; // bord de la zone centrale
  // Zone centrale (bleu très clair) avec courbe en prolongement du bloc
  ctx.fillStyle = '#E8EEFF';
  curve(ctx, x0, y0, midEnd + 60, h, 120);
  ctx.fill();
  ctx.fillStyle = '#D5E0FF';
  curve(ctx, x0, y0, leftEnd + 40, h, 100);
  ctx.fill();
  // Grand bloc coloré
  const g = ctx.createLinearGradient(x0, y0, leftEnd, y0 + h);
  g.addColorStop(0, NAVY);
  g.addColorStop(1, '#1646C9');
  ctx.fillStyle = g;
  curve(ctx, x0, y0, leftEnd, h, 110);
  ctx.fill();
  // Souche blanche
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(midEnd + 60, y0, x0 + w - midEnd - 60, h);
  ctx.restore();

  // Perforation entre la zone centrale et la souche
  const cut = midEnd + 60;
  ctx.save();
  ctx.strokeStyle = '#B9C4DE';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  ctx.moveTo(cut, y0 + 24);
  ctx.lineTo(cut, y0 + h - 24);
  ctx.stroke();
  ctx.restore();
  // Encoches
  ctx.fillStyle = '#E9ECF3';
  ctx.beginPath();
  ctx.arc(cut, y0, 20, 0, Math.PI);
  ctx.arc(cut, y0 + h, 20, Math.PI, Math.PI * 2);
  ctx.fill();

  // ----- Grand bloc : prix, titre, date -----
  const px = x0 + 70;
  // Pastille de prix (étoile à dents)
  ctx.fillStyle = '#FFFFFF';
  star(ctx, px + 62, y0 + 92, 62, 54, 16);
  ctx.fill();
  ctx.fillStyle = NAVY;
  ctx.textAlign = 'center';
  ctx.font = `800 22px ${FONT}`;
  ctx.fillText(o.labels.ticket.toUpperCase(), px + 62, y0 + 82);
  ctx.font = `800 28px ${FONT}`;
  fit(ctx, o.price, px + 62, y0 + 116, 96, 28, 800);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#93B3FF';
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText(o.ticketName.toUpperCase(), px + 160, y0 + 78);
  ctx.fillStyle = '#FFFFFF';
  const titleW = leftEnd - px - 260;
  let tsize = 104;
  let lines: string[] = [];
  for (; tsize >= 56; tsize -= 6) {
    ctx.font = `800 ${tsize}px ${FONT}`;
    lines = lay(ctx, o.title.toUpperCase(), titleW, 99);
    if (lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= titleW)) break;
  }
  if (lines.length > 3) lines = lay(ctx, o.title.toUpperCase(), titleW, 3);
  let ty = y0 + 130 + tsize;
  for (const l of lines) {
    ctx.fillText(l, px + 150, ty);
    ty += Math.round(tsize * 1.05);
  }
  // Date et heure en bas à gauche
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(o.dateLong, px, y0 + h - 118);
  ctx.font = `500 34px ${FONT}`;
  ctx.fillStyle = '#C9D7FF';
  ctx.fillText(`${o.labels.time} ${o.time}`, px, y0 + h - 70);
  // Points décoratifs
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    ctx.beginPath();
    ctx.arc(leftEnd - 230 + c * 26, y0 + h - 96 + r * 26, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // ----- Zone centrale : séance, place, lieu, titulaire -----
  const mx = leftEnd + 90;
  const boxes: [string, string][] = [[o.labels.ticket, o.ticketName]];
  if (o.seat) boxes.push([o.labels.seat, o.seat]);
  if (o.session) boxes.push([o.labels.session, o.session]);
  let bx = mx;
  const bw = Math.min(200, (midEnd + 20 - mx) / boxes.length - 14);
  for (const [k, v] of boxes) {
    ctx.fillStyle = NAVY;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(k.toUpperCase(), bx, y0 + 96);
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 2.5;
    rr(ctx, bx, y0 + 112, bw, 54, 8);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `800 26px ${FONT}`;
    fit(ctx, v, bx + bw / 2, y0 + 150, bw - 20, 26, 800);
    ctx.textAlign = 'left';
    bx += bw + 14;
  }
  const mw = midEnd - mx + 10;
  ctx.fillStyle = NAVY;
  ctx.font = `800 36px ${FONT}`;
  ctx.fillText(o.labels.venue, mx, y0 + 260);
  ctx.font = `500 32px ${FONT}`;
  ctx.fillStyle = '#2B3857';
  let vy = y0 + 304;
  ctx.font = `500 30px ${FONT}`;
  for (const part of lay(ctx, o.venueName, mw, 2)) {
    ctx.fillText(part, mx, vy);
    vy += 40;
  }
  for (const l of [o.address, o.city].filter(Boolean)) {
    fit(ctx, l, mx, vy, mw, 30, 500, 'left');
    vy += 40;
  }
  ctx.fillStyle = NAVY;
  ctx.font = `800 36px ${FONT}`;
  ctx.fillText(o.labels.holder, mx, y0 + h - 130);
  ctx.font = `500 32px ${FONT}`;
  ctx.fillStyle = '#2B3857';
  fit(ctx, o.holder, mx, y0 + h - 84, mw, 32, 500, 'left');
  ctx.fillStyle = BLUE;
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText('Event509', mx, y0 + h - 40);

  // ----- Souche : titre, détails, QR -----
  const sx = cut + 60;
  const sw = x0 + w - sx - 60;
  ctx.fillStyle = NAVY;
  ctx.font = `800 40px ${FONT}`;
  let sy = y0 + 88;
  for (const l of lay(ctx, o.title, sw, 2)) {
    ctx.fillText(l, sx, sy);
    sy += 46;
  }
  ctx.fillStyle = BLUE;
  ctx.fillRect(sx, sy - 24, sw, 6);
  const rows: [string, string][] = [[o.labels.date, o.dateLong], [o.labels.time, o.time]];
  if (o.seat) rows.push([o.labels.seat, o.seat]);
  let ry = sy + 22;
  for (const [k, v] of rows) {
    ctx.fillStyle = '#5A6683';
    ctx.font = `600 24px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(k, sx, ry);
    ctx.fillStyle = NAVY;
    fit(ctx, v, sx + 120, ry, sw - 120, 24, 700, 'left');
    ry += 34;
  }

  // QR code net : 1 module = un nombre entier de pixels
  const QRCode = (await import('qrcode')).default;
  const qr = document.createElement('canvas');
  const QS = 220;
  await QRCode.toCanvas(qr, o.code, { width: QS * SCALE, margin: 0, errorCorrectionLevel: 'M', color: { dark: NAVY, light: '#FFFFFF' } });
  const qx = sx + (sw - QS) / 2;
  const qy = y0 + h - QS - 100;
  ctx.fillStyle = '#FFFFFF';
  rr(ctx, qx - 12, qy - 12, QS + 24, QS + 24, 14);
  ctx.fill();
  ctx.strokeStyle = '#D5DBEA';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, qx, qy, QS, QS);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = '#4A5573';
  ctx.font = `600 24px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(o.code, sx + sw / 2, qy + QS + 40);
  ctx.fillStyle = '#5A6683';
  fit(ctx, o.labels.scan, sx + sw / 2, qy + QS + 70, sw, 20, 600);
  ctx.textAlign = 'left';

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Image impossible à générer');
  return blob;
}

/** Génère puis télécharge l'image du billet. */
export async function downloadTicketImage(o: TicketImageOpts) {
  const blob = await renderTicketBlob(o);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `billet-${o.code}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Bloc dont le bord droit est une courbe en S (comme sur le modèle). */
function curve(ctx: CanvasRenderingContext2D, x: number, y: number, right: number, h: number, bend: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(right - bend, y);
  ctx.bezierCurveTo(right + bend * 0.2, y + h * 0.25, right - bend * 1.1, y + h * 0.7, right - bend * 0.4, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, ro: number, ri: number, n: number) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 ? ri : ro;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

/** Coupe un texte en lignes qui tiennent dans `max` pixels (la dernière ligne finit par « … » si besoin). */
function lay(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines: number) {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) {
      out.push(line);
      line = w;
    } else line = t;
  }
  if (line) out.push(line);
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    let last = `${kept[maxLines - 1]} ${out.slice(maxLines).join(' ')}`;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return out;
}

/** Écrit un texte en réduisant la taille de police jusqu'à ce qu'il tienne dans `max` pixels. */
function fit(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, size: number, weight: number, align: 'center' | 'left' = 'center') {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (ctx.measureText(text).width > max && s > 12) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  const prev = ctx.textAlign;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.textAlign = prev;
}
