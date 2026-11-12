import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPayment, payConfigured, verifyPayment } from '../../api/_lib/pay';

const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('paiement en ligne', () => {
  beforeEach(() => {
    process.env.PAY_CLIENT_ID = 'MARCHAND123';
    delete process.env.PAY_BASE_URL;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PAY_CLIENT_ID;
  });

  it('est désactivé sans identifiant marchand', () => {
    delete process.env.PAY_CLIENT_ID;
    expect(payConfigured()).toBe(false);
  });

  it('crée la transaction avec la référence, le montant et la méthode « carte »', async () => {
    const f = vi.fn(() => reply({ status: true, url: 'https://pay.example/x', transaction_id: 123 }));
    vi.stubGlobal('fetch', f);
    const p = await createPayment({ reference: 'o_abc', amountHtg: 250, method: 'card' });
    expect(p).toEqual({ url: 'https://pay.example/x', transactionId: '123' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://plopplop.solutionip.app/api/paiement-marchand');
    expect(JSON.parse(String(init.body))).toEqual({ client_id: 'MARCHAND123', refference_id: 'o_abc', montant: 250, payment_method: 'carte' });
  });

  it('refuse une réponse sans adresse de paiement', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply({ status: false, message: 'Montant invalide' }, 400)));
    await expect(createPayment({ reference: 'o_abc', amountHtg: 5, method: 'moncash' })).rejects.toThrow();
  });

  it('traduit l’état de la plateforme : ok = payé, failed = échoué, sinon en attente', async () => {
    const states: [string, string][] = [['ok', 'paid'], ['failed', 'failed'], ['no', 'pending']];
    for (const [trans, expected] of states) {
      vi.stubGlobal('fetch', vi.fn(() => reply({ status: true, trans_status: trans })));
      expect(await verifyPayment('o_abc')).toBe(expected);
    }
  });
});
