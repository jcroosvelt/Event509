import { describe, expect, it } from 'vitest';
import { defaultSiteInfo, fillTokens, parseDoc, tokensIn } from './legalDoc';
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
      expect(legalDefaults[d].fr).not.toMatch(/\[[^\]]+\]/); // plus aucun crochet à compléter
    }
  });
});
