import { expect, type Page } from '@playwright/test';

/** Connexion avec un compte de démonstration (u1 participant, u2 organisateur, u8 staff, u9 comptable, u7 admin). */
export async function loginAs(page: Page, label: RegExp) {
  await page.goto('/connexion');
  await page.getByText('Comptes de démonstration').click();
  await page.getByRole('button', { name: label }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/connexion'));
}

/** Point de départ propre : aucun état local, puis l'utilisateur par défaut (participant). */
export async function fresh(page: Page, path = '/') {
  await page.goto(path);
  await page.evaluate(() => localStorage.clear());
  await page.goto(path);
  await expect(page.locator('#contenu')).toBeVisible();
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1000) < 1024;
