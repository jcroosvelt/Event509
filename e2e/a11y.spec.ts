import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

/**
 * Audit d'accessibilité automatisé (axe-core, règles WCAG 2.1 A/AA) sur les pages
 * principales, en thème clair et sombre. Échoue sur toute violation sérieuse ou critique.
 */
const publicPages = ['/', '/explorer', '/e/festival-kompa-live-2026', '/e/ayiti-tech-summit/achat?t=t2b:1', '/billets', '/billets/it3', '/connexion', '/revente', '/o/lakay-productions', '/compte/parametres'];
const orgPages = ['/organisateur', '/organisateur/evenements/e1/stats', '/organisateur/participants', '/organisateur/checkin', '/organisateur/evenements/nouveau', '/admin', '/admin/utilisateurs'];

async function audit(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  await page.locator('#contenu').waitFor();
  await page.waitForLoadState('networkidle');
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  return bad.map((v) => `${path} · ${v.id} (${v.impact}) : ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

for (const theme of ['light', 'dark'] as const) {
  test(`pages publiques sans violation sérieuse — thème ${theme}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((th) => localStorage.setItem('e509.theme', JSON.stringify(th)), theme);
    const problems: string[] = [];
    for (const p of publicPages) problems.push(...(await audit(page, p)));
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test(`espace organisateur et admin sans violation sérieuse — thème ${theme}`, async ({ page }) => {
    await loginAs(page, /Admin plateforme/);
    await page.evaluate((th) => localStorage.setItem('e509.theme', JSON.stringify(th)), theme);
    const problems: string[] = [];
    for (const p of orgPages) problems.push(...(await audit(page, p)));
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

/** Aucune page ne doit déborder horizontalement sur mobile (gouttière de 16 px respectée). */
const allPages = [...publicPages, '/notifications', '/compte', '/compte/achats', '/favoris', '/ambassadeurs', '/cgu'];
test('aucun débordement horizontal sur petit écran (375 px)', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 1024, 'vérifié sur le projet mobile');
  await page.setViewportSize({ width: 375, height: 812 });
  const overflowing: string[] = [];
  const check = async (p: string) => {
    await page.goto(p);
    await page.locator('#contenu').waitFor();
    await page.waitForLoadState('networkidle');
    const bad = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      // Un élément « déborde » s'il dépasse le bord droit sans être dans une zone défilante prévue pour ça
      return [...document.querySelectorAll('#contenu *')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.right <= w + 1) return false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const ox = getComputedStyle(p).overflowX;
            if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return false;
          }
          return true;
        })
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`);
    });
    if (bad.length) overflowing.push(`${p} : ${bad.join(', ')}`);
  };
  for (const p of allPages) await check(p);
  await loginAs(page, /Admin plateforme/);
  for (const p of orgPages) await check(p);
  expect(overflowing, overflowing.join('\n')).toEqual([]);
});
