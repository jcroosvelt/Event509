import { describe, expect, it } from 'vitest';
import { DEFAULT_REFUND_DAYS, payoutState, paidSoldShare, refundDaysOf, refundDeadlineMs, refundOpen, startMs, type PayoutEventInput } from './payouts';

const DAY = 86_400_000;
const start = '2030-06-10T20:00:00';
const at = (days: number) => startMs(start) - days * DAY; // « il y a `days` jours avant l'événement »
const ev = (over: Partial<PayoutEventInput> = {}): PayoutEventInput => ({
  status: 'published', start, tickets: [{ kind: 'paid', quota: 100, sold: 40 }, { kind: 'free', quota: 500, sold: 0 }], ...over,
});

describe('délai de remboursement', () => {
  it('7 jours par défaut, borné, 0 = aucun remboursement', () => {
    expect(DEFAULT_REFUND_DAYS).toBe(7);
    expect(refundDaysOf({})).toBe(7);
    expect(refundDaysOf({ refundDays: 3 })).toBe(3);
    expect(refundDaysOf({ refundDays: 0 })).toBe(0);
    expect(refundDaysOf({ refundDays: 31 })).toBe(7);
    expect(refundDaysOf({ refundDays: 2.5 })).toBe(7);
    expect(refundDaysOf({}, 14)).toBe(14); // valeur de l'administrateur
    expect(refundDaysOf({}, 99)).toBe(7);
  });
  it('ouvert jusqu’à N jours avant le début, jamais ouvert à 0', () => {
    expect(refundOpen({ start }, at(8))).toBe(true);
    expect(refundOpen({ start }, at(7))).toBe(false);
    expect(refundOpen({ start }, at(1))).toBe(false);
    expect(refundOpen({ start, refundDays: 0 }, at(40))).toBe(false);
    expect(refundDeadlineMs({ start, refundDays: 0 })).toBe(-Infinity);
    expect(refundOpen({ start, refundDays: 2 }, at(3))).toBe(true);
  });
});

describe('versement par événement', () => {
  it('billets payants seulement : les gratuits ne comptent pas', () => {
    expect(paidSoldShare(ev())).toBe(0.4);
    expect(paidSoldShare({ tickets: [{ kind: 'free', quota: 10, sold: 10 }] })).toBe(0);
    expect(paidSoldShare({ tickets: [] })).toBe(0);
  });
  it('pas de versement tant que le délai de remboursement est ouvert', () => {
    const s = payoutState(ev(), at(20));
    expect(s).toMatchObject({ eligible: false, reason: 'window', percentSold: 40 });
    expect(s.availableAt).toBe(at(7));
  });
  it('délai terminé : 40 % vendus suffisent, 39 % non, sauf à 5 jours ou moins', () => {
    expect(payoutState(ev(), at(6))).toMatchObject({ eligible: true, reason: 'ok' });
    const low = ev({ tickets: [{ kind: 'paid', quota: 100, sold: 39 }] });
    const s = payoutState(low, at(6));
    expect(s).toMatchObject({ eligible: false, reason: 'threshold', percentSold: 39 });
    expect(s.availableAt).toBe(at(5));
    expect(payoutState(low, at(5))).toMatchObject({ eligible: true }); // 5 jours avant : quel que soit le nombre vendu
    expect(payoutState(low, at(1))).toMatchObject({ eligible: true });
    expect(payoutState(ev({ tickets: [{ kind: 'paid', quota: 100, sold: 0 }] }), at(2))).toMatchObject({ eligible: true });
  });
  it('sans remboursement possible (0 jour) : versement dès 40 % vendus', () => {
    expect(payoutState(ev({ refundDays: 0 }), at(30))).toMatchObject({ eligible: true });
    expect(payoutState(ev({ refundDays: 0, tickets: [{ kind: 'paid', quota: 100, sold: 10 }] }), at(30))).toMatchObject({ eligible: false, reason: 'threshold' });
  });
  it('délai plus court que 5 jours : la fenêtre de remboursement décide, puis le versement est ouvert', () => {
    const e = ev({ refundDays: 2, tickets: [{ kind: 'paid', quota: 100, sold: 10 }] });
    expect(payoutState(e, at(5)).reason).toBe('window');
    expect(payoutState(e, at(3)).reason).toBe('window');
    expect(payoutState(e, at(2))).toMatchObject({ eligible: true }); // fenêtre fermée et à moins de 5 jours
  });
  it('brouillon, en modération, annulé : jamais ; terminé : oui', () => {
    for (const status of ['draft', 'pending', 'rejected', 'cancelled']) expect(payoutState(ev({ status }), at(1)).reason).toBe('status');
    expect(payoutState(ev({ status: 'ended' }), at(-3))).toMatchObject({ eligible: true });
  });
});
