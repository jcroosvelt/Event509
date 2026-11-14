import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { recordDeliveryStatus } from './_lib/otp.js';

/**
 * Webhook WhatsApp Cloud API (Meta). Adresse à déclarer chez Meta : https://<votre-site>/api/whatsapp/webhook
 *  - GET  : vérification de l'adresse (hub.verify_token = META_VERIFY_TOKEN) ;
 *  - POST : accusés de livraison, acceptés seulement s'ils portent une signature X-Hub-Signature-256 valide (META_APP_SECRET).
 * Le corps brut est lu ici (pas d'analyse automatique) : la signature se calcule sur les octets exacts.
 */
export const config = { api: { bodyParser: false } };

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

async function raw(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    const b = Buffer.isBuffer(c) ? c : Buffer.from(c as string);
    size += b.length;
    if (size > 1_000_000) throw new Error('trop gros');
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

export default async function webhook(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const token = process.env.META_VERIFY_TOKEN;
    const q = req.query;
    if (token && q['hub.mode'] === 'subscribe' && typeof q['hub.verify_token'] === 'string' && same(q['hub.verify_token'], token)) {
      res.status(200).setHeader('Content-Type', 'text/plain').send(String(q['hub.challenge'] ?? '').replace(/[^\w-]/g, '').slice(0, 100));
      return;
    }
    res.status(403).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    res.status(503).end();
    return;
  }
  let body: Buffer;
  try {
    body = await raw(req);
  } catch {
    res.status(413).end();
    return;
  }
  const given = String(req.headers['x-hub-signature-256'] ?? '');
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  if (!same(given, expected)) {
    res.status(401).end();
    return;
  }
  try {
    const data = JSON.parse(body.toString()) as { entry?: { changes?: { value?: { statuses?: { id?: string; status?: string; errors?: { code?: number }[] }[] } }[] }[] };
    for (const e of data.entry ?? [])
      for (const ch of e.changes ?? [])
        for (const s of ch.value?.statuses ?? []) if (s.id && s.status) await recordDeliveryStatus(s.id, s.status, s.errors?.[0]?.code);
  } catch (err) {
    console.error('[whatsapp-webhook]', (err as Error).message);
  }
  // Meta attend toujours un 200 une fois la signature validée
  res.status(200).json({ ok: true });
}
