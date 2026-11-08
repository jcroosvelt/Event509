/**
 * Génère une image PNG du billet (QR + informations) et la télécharge.
 * Sert de solution hors connexion en attendant les cartes Wallet signées par le serveur.
 */
export async function downloadTicketImage(opts: {
  svg: SVGSVGElement;
  title: string;
  ticketName: string;
  when: string;
  where: string;
  holder: string;
  seat?: string;
  code: string;
}) {
  const W = 720, H = 1080, S = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(S, S);

  // Fond
  ctx.fillStyle = '#F1F3F8';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, 40, 40, W - 80, H - 80, 40);
  ctx.fill();
  // Bandeau
  ctx.fillStyle = '#0B1533';
  roundRect(ctx, 40, 40, W - 80, 220, 40, true);
  ctx.fill();
  const font = '"Plus Jakarta Sans Variable", system-ui, sans-serif';
  ctx.fillStyle = '#93B3FF';
  ctx.font = `600 22px ${font}`;
  ctx.fillText(opts.ticketName, 80, 110);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 36px ${font}`;
  wrap(ctx, opts.title, 80, 160, W - 160, 44, 2);

  // QR
  const xml = new XMLSerializer().serializeToString(opts.svg);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  ctx.drawImage(img, (W - 380) / 2, 310, 380, 380);

  ctx.fillStyle = '#4A5573';
  ctx.font = `600 24px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(opts.code, W / 2, 730);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#0B1533';
  ctx.font = `700 26px ${font}`;
  let y = 800;
  for (const line of [opts.when, opts.where, opts.seat, opts.holder].filter(Boolean) as string[]) {
    y = wrap(ctx, line, 80, y, W - 160, 34, 2) + 14;
  }
  ctx.fillStyle = '#1F5EFF';
  ctx.font = `800 26px ${font}`;
  ctx.fillText('Event509', 80, H - 80);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `billet-${opts.code}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, topOnly = false) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  if (topOnly) {
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
  } else {
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
  }
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Écrit un texte sur plusieurs lignes ; renvoie l'ordonnée de la dernière ligne. */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, maxLines: number) {
  const words = text.split(' ');
  let line = '';
  let n = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > max && line) {
      ctx.fillText(line, x, y);
      y += lh;
      line = w;
      if (++n >= maxLines - 1) break;
    } else line = test;
  }
  ctx.fillText(line, x, y);
  return y;
}
