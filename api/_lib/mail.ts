import QRCode from 'qrcode';
import type { EventItem, IssuedTicket } from '../../src/types.js';

/**
 * Envoi d'emails par Resend (https://resend.com). Réglages à définir dans Vercel :
 *   RESEND_API_KEY  clé d'API Resend
 *   MAIL_FROM       expéditeur, par exemple « Event509 <billets@votre-domaine.com> » (domaine vérifié chez Resend)
 * Tant qu'ils ne sont pas définis, rien n'est envoyé : la commande reste valable et le billet reste
 * consultable par le lien de la page de confirmation.
 */
export const mailConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;

/** Adresse publique du site (liens des emails). */
export function siteUrl() {
  const s = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return s.replace(/\/$/, '');
}

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Attachment {
  filename: string;
  content: string; // base64
}

async function send(to: string, subject: string, html: string, attachments: Attachment[] = []): Promise<boolean> {
  if (!mailConfigured()) return false;
  try {
    const res = await fetch(process.env.RESEND_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html, attachments }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error('[mail] refus du fournisseur', res.status, await res.text().catch(() => ''));
    return res.ok;
  } catch (e) {
    console.error('[mail] échec', e);
    return false;
  }
}

/** Date d'événement écrite sans fuseau (heure locale d'Haïti) : on garde l'heure telle qu'elle est écrite. */
function when(iso: string, lang: 'fr' | 'en') {
  const d = new Date(iso.length === 16 ? `${iso}:00Z` : `${iso}Z`.replace('ZZ', 'Z'));
  return d.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' });
}

const T = {
  fr: {
    subject: (e: string) => `Vos billets pour ${e}`,
    hello: (n: string) => `Bonjour ${n},`,
    intro: 'Merci pour votre achat ! Voici vos billets. Chaque billet a un QR code unique, joint à cet email en image : présentez-le à l’entrée, depuis votre téléphone ou imprimé.',
    ticket: 'Billet', seat: 'Place', code: 'Code',
    button: 'Voir mes billets',
    warn: 'Ne partagez pas vos QR codes : chaque billet n’est valable qu’une seule fois, pour la première personne qui le présente.',
    footer: 'Cet email a été envoyé par Event509 parce qu’une commande a été passée avec cette adresse.',
  },
  en: {
    subject: (e: string) => `Your tickets for ${e}`,
    hello: (n: string) => `Hello ${n},`,
    intro: 'Thank you for your purchase! Here are your tickets. Each ticket has a unique QR code, attached to this email as an image: show it at the entrance, on your phone or printed.',
    ticket: 'Ticket', seat: 'Seat', code: 'Code',
    button: 'View my tickets',
    warn: 'Do not share your QR codes: each ticket is valid only once, for the first person who shows it.',
    footer: 'This email was sent by Event509 because an order was placed with this address.',
  },
};

/** Email des billets : récapitulatif, lien vers la page des billets, et un QR code unique par billet en pièce jointe. */
export async function sendTicketsEmail(opts: { to: string; name: string; lang: 'fr' | 'en'; event: EventItem; tickets: IssuedTicket[]; orderId: string; accessKey: string }): Promise<boolean> {
  if (!mailConfigured()) return false;
  const { to, name, lang, event, tickets, orderId, accessKey } = opts;
  const tx = T[lang];
  const link = `${siteUrl()}/commande/${encodeURIComponent(orderId)}?k=${encodeURIComponent(accessKey)}`;
  const attachments: Attachment[] = [];
  const rows: string[] = [];
  for (const [i, t] of tickets.entries()) {
    const png = await QRCode.toBuffer(t.code, { type: 'png', margin: 2, width: 480, errorCorrectionLevel: 'M', color: { dark: '#0B1533', light: '#FFFFFF' } });
    attachments.push({ filename: `billet-${i + 1}-${t.code}.png`, content: png.toString('base64') });
    const tt = event.tickets.find((x) => x.id === t.ticketTypeId)?.name ?? '';
    rows.push(
      `<tr><td style="padding:10px 0;border-top:1px solid #E6E9F2"><b>${tx.ticket} ${i + 1}</b>${tt ? ` · ${esc(tt)}` : ''}${t.seat ? ` · ${tx.seat} ${esc(t.seat)}` : ''}<br><span style="font-family:monospace;color:#4A5573">${tx.code} ${esc(t.code)}</span></td></tr>`,
    );
  }
  const place = event.venue ? `${event.venue.name}${event.venue.city ? `, ${event.venue.city}` : ''}` : event.online?.platform ?? '';
  const html = `<!doctype html><html><body style="margin:0;background:#F1F3F8;font-family:Arial,Helvetica,sans-serif;color:#0B1533">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:20px;overflow:hidden">
<tr><td style="background:#0B1533;color:#fff;padding:22px 28px;font-size:20px;font-weight:bold">Event<span style="color:#93B3FF">509</span></td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px">${tx.hello(esc(name))}</p>
<p style="margin:0 0 18px;line-height:1.5">${tx.intro}</p>
<p style="margin:0 0 4px;font-size:20px;font-weight:bold">${esc(event.title)}</p>
<p style="margin:0 0 18px;color:#4A5573">${esc(when(event.start, lang))}${place ? `<br>${esc(place)}` : ''}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#1F5EFF;color:#fff;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:bold;display:inline-block">${tx.button}</a></p>
<p style="margin:0;color:#4A5573;font-size:13px;line-height:1.5">${tx.warn}</p>
</td></tr>
<tr><td style="padding:16px 28px;background:#F1F3F8;color:#6E7689;font-size:12px">${tx.footer}</td></tr>
</table></td></tr></table></body></html>`;
  return send(to, tx.subject(event.title), html, attachments);
}
