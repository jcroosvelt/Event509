import { describe, expect, it } from 'vitest';
import { RATE_MAX, RATE_MIN, rateAccepted } from '../../api/_lib/routes.js';

describe('taux de change automatique : valeurs refusées', () => {
  it('accepte une variation raisonnable', () => {
    expect(rateAccepted(135, 132)).toBe(true);
    expect(rateAccepted(120, 132)).toBe(true);
  });
  it('refuse les valeurs absurdes, hors plage, non numériques ou en saut brutal (> 25 %)', () => {
    for (const v of [0, -5, NaN, Infinity, RATE_MIN - 1, RATE_MAX + 1, '135', null, undefined, {}, 200, 90]) expect(rateAccepted(v, 132), String(v)).toBe(false);
  });
});

const DB = process.env.TEST_DATABASE_URL;
describe.skipIf(!DB)('taux de change automatique (intégration)', () => {
  const fake = (body: unknown, ok = true) => (async () => ({ ok, status: ok ? 200 : 503, json: async () => body })) as unknown as typeof fetch;
  it('met à jour avec une valeur crédible, garde l’ancienne sinon, et enregistre la date', async () => {
    process.env.DATABASE_URL = DB;
    const { updateMarketRate } = await import('../../api/_lib/routes.js');
    const { RATES } = await import('../../api/_lib/fees.js');
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: DB });
    await pool.query(`delete from settings where key = 'rate'`);
    const start = (await updateMarketRate(fake({ result: 'error' }))).rate;
    expect(start).toBe(RATES.USD);
    expect((await updateMarketRate(fake({ result: 'success', rates: { HTG: 131.4 } }))).updated).toBe(true);
    expect(RATES.USD).toBe(131.4);
    const row = (await pool.query(`select value from settings where key = 'rate'`)).rows[0].value;
    expect(row.usdToHtg).toBe(131.4);
    expect(Date.now() - Date.parse(row.at)).toBeLessThan(10_000);
    // Valeur absurde, saut brutal, source en panne, réponse mal formée : l'ancien taux reste
    for (const f of [fake({ result: 'success', rates: { HTG: 9999 } }), fake({ result: 'success', rates: { HTG: 200 } }), fake({ result: 'success', rates: {} }), fake({}, false), fake({ result: 'success', rates: { HTG: '131' } }), fake({})]) {
      const r = await updateMarketRate(f).catch(() => ({ updated: false, rate: RATES.USD }));
      expect(r.updated).toBe(false);
    }
    expect(RATES.USD).toBe(131.4);
    await pool.query(`delete from settings where key = 'rate'`);
    await pool.end();
  });
});

import { billingCurrencyFor } from '../../api/_lib/fees.js';
describe('monnaie de facturation des organisateurs', () => {
  it('dollars hors d’Haïti, gourdes en Haïti ou pays inconnu', () => {
    for (const c of ['US', 'us', 'FR', 'CA', 'DO']) expect(billingCurrencyFor(c), c).toBe('USD');
    for (const c of ['HT', 'ht', '', null, undefined, 'HAI', 'H', 5]) expect(billingCurrencyFor(c), String(c)).toBe('HTG');
  });
});

describe.skipIf(!DB)('facturation selon le pays (intégration)', () => {
  it('l’abonnement et le boost annoncent la bonne monnaie', async () => {
    process.env.DATABASE_URL = DB;
    process.env.JWT_SECRET = 'q'.repeat(40);
    const { handle } = await import('../../api/_lib/handler.js');
    const mk = async (country: string, n: number) => {
      const r = await handle({ method: 'POST', path: '/auth/signup', query: {}, body: { name: `Orga ${country}`, email: `bill${n}-${Date.now()}@sec.test`, password: 'Soleil2026x', acceptTerms: true }, ip: `10.7.0.${n}` });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const token = (r.body as { token: string }).token;
      const up = await handle({ method: 'POST', path: '/auth/organizer', query: {}, body: { orgName: `Org ${country} ${n}`, country }, authorization: `Bearer ${token}`, ip: `10.7.0.${n}` });
      expect(up.status, JSON.stringify(up.body)).toBe(200);
      return token;
    };
    for (const [country, expected, n] of [['US', 'USD', 1], ['HT', 'HTG', 2]] as const) {
      const token = await mk(country, n);
      const prem = await handle({ method: 'GET', path: '/org/premium', query: {}, body: undefined, authorization: `Bearer ${token}`, ip: '10.7.1.1' });
      expect((prem.body as { billingCurrency: string }).billingCurrency, country).toBe(expected);
      const boost = await handle({ method: 'GET', path: '/boost/config', query: {}, body: undefined, authorization: `Bearer ${token}`, ip: '10.7.1.1' });
      expect((boost.body as { billingCurrency: string }).billingCurrency, country).toBe(expected);
    }
    const anon = await handle({ method: 'GET', path: '/boost/config', query: {}, body: undefined, ip: '10.7.1.2' });
    expect((anon.body as { billingCurrency: string }).billingCurrency).toBe('HTG');
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: DB });
    await pool.query(`delete from users where email like 'bill%@sec.test'`);
    await pool.end();
  });
});
