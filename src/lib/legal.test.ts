import { describe, expect, it } from 'vitest';
import { PAYOUT_LAST_DAYS, PAYOUT_MIN_SOLD } from './payouts';
import { AUTO_TOKENS, defaultSiteInfo, feeTokens, fillTokens, parseDoc, tokensIn } from './legalDoc';
import { legalDefaults, LEGAL_DOCS } from '../data/legalDefaults';

describe('documents légaux', () => {
  it('lit le titre, la mise à jour, les sections et les puces', () => {
    const d = parseDoc('# Titre\n> Dernière mise à jour : x\n\n## 1. Section\n\nUn paragraphe.\n- a\n- b');
    expect(d.title).toBe('Titre');
    expect(d.blocks.map((b) => b.kind)).toEqual(['note', 'h', 'p', 'li', 'li']);
  });

  it('insère les valeurs réglées ; une valeur vide devient « à renseigner »', () => {
    const v = { ...defaultSiteInfo, address: '', email: 'contact@exemple.ht' };
    expect(fillTokens('Écris à {{email}} ou à {{address}}.', v, 'fr')).toBe('Écris à contact@exemple.ht ou à [à renseigner].');
    expect(fillTokens('Write to {{address}}.', v, 'en')).toBe('Write to [to be provided].');
  });

  it('les trois documents existent en français et en anglais avec les mêmes valeurs à insérer', () => {
    for (const d of LEGAL_DOCS) {
      const fr = parseDoc(legalDefaults[d].fr);
      const en = parseDoc(legalDefaults[d].en);
      expect(fr.title).not.toBe('');
      expect(en.title).not.toBe('');
      expect(fr.blocks.filter((b) => b.kind === 'h').length).toBe(en.blocks.filter((b) => b.kind === 'h').length);
      expect(tokensIn(legalDefaults[d].fr).sort()).toEqual(tokensIn(legalDefaults[d].en).sort());
      expect(tokensIn(legalDefaults[d].fr).sort()).toEqual(tokensIn(legalDefaults[d].es).sort());
      const es = parseDoc(legalDefaults[d].es);
      expect(es.blocks.map((b) => b.kind)).toEqual(fr.blocks.map((b) => b.kind));
      expect(legalDefaults[d].es).not.toMatch(/\[[^\]]+\]/);
      expect(legalDefaults[d].fr).not.toMatch(/\[[^\]]+\]/); // plus aucun crochet à compléter
    }
  });
});

describe('commission dans les documents légaux (calculée, jamais saisie)', () => {
  const base = { percent: 5, fixedHTG: 0, buyerShare: 50, freeNoFee: true };
  it('taux, part de l’acheteur et part de l’organisateur suivent les réglages', () => {
    expect(feeTokens(base, 'fr')).toEqual({ commission: '5', commissionBuyer: '2,5', commissionOrganizer: '2,5', feeBuyer: '2,5 % du prix du billet', feeOrganizer: '2,5 % du prix du billet' });
    expect(feeTokens(base, 'en').feeBuyer).toBe('2.5% of the ticket price');
    const t = feeTokens({ ...base, percent: 7, fixedHTG: 10, buyerShare: 30 }, 'fr');
    expect(t).toMatchObject({ commission: '7', commissionBuyer: '2,1', commissionOrganizer: '4,9', feeBuyer: '2,1 % du prix du billet + 3 HTG par billet', feeOrganizer: '4,9 % du prix du billet + 7 HTG par billet' });
  });
  it('une part nulle est dite « aucun frais », et le texte ne montre jamais « [à renseigner] » pour la commission', () => {
    expect(feeTokens({ ...base, buyerShare: 0 }, 'fr').feeBuyer).toBe('aucun frais');
    expect(feeTokens({ ...base, buyerShare: 100 }, 'en').feeOrganizer).toBe('no fee');
    const out = fillTokens('{{commission}} % ({{feeBuyer}} / {{feeOrganizer}})', { ...feeTokens({ ...base, buyerShare: 100 }, 'fr') }, 'fr');
    expect(out).toBe('5 % (5 % du prix du billet / aucun frais)');
    expect(AUTO_TOKENS).toContain('feeBuyer');
  });
  it('les textes d’origine n’utilisent que des valeurs connues, en français comme en anglais', () => {
    for (const d of LEGAL_DOCS) for (const lang of ['fr', 'en', 'es'] as const)
      for (const k of tokensIn(legalDefaults[d][lang])) expect(Object.keys({ ...defaultSiteInfo, ...feeTokens(base, lang) }), `${d}/${lang}/${k}`).toContain(k);
  });
});

describe('règles de versement et de remboursement citées dans les documents', () => {
  it('les seuils écrits dans les conditions sont ceux du code', () => {
    expect(legalDefaults.terms.fr).toContain(`${PAYOUT_MIN_SOLD} % des billets payants`);
    expect(legalDefaults.terms.fr).toContain(`${PAYOUT_LAST_DAYS} jours ou moins`);
    expect(legalDefaults.terms.en).toContain(`${PAYOUT_MIN_SOLD}% of paid tickets`);
    expect(legalDefaults.terms.en).toContain(`${PAYOUT_LAST_DAYS} days away or less`);
  });
  it('le délai de remboursement et l’annulation après versement sont expliqués en français et en anglais', () => {
    expect(legalDefaults.terms.fr).toMatch(/Une fois un versement demandé ou effectué/);
    expect(legalDefaults.terms.en).toMatch(/Once a payout has been requested or made/);
    expect(legalDefaults.refund.fr).toMatch(/Passé ce délai, aucune demande n’est acceptée/);
    expect(legalDefaults.refund.en).toMatch(/After that period no request is accepted/);
  });
});
