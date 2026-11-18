import { describe, expect, it } from 'vitest';
import { validCover } from './_lib/files.js';

describe('validCover : images d’événement', () => {
  it('accepte un dégradé normal, un fichier du site et une adresse https', () => {
    expect(validCover('linear-gradient(135deg, #1509F3 0%, #0C0640 100%)')).toBe(true);
    expect(validCover('radial-gradient(circle at 20% 20%, #1509F3, #080808)')).toBe(true);
    expect(validCover('linear-gradient(225deg, rgb(21, 9, 243) 0%, rgba(12, 6, 64, 0.9) 100%)')).toBe(true);
    expect(validCover('/api/files/abc123def456')).toBe(true);
    expect(validCover('https://exemple.com/affiche.jpg')).toBe(true);
  });

  it('refuse un dégradé qui charge une ressource ou exécute quelque chose (url, image-set, var, expression, échappements)', () => {
    expect(validCover('linear-gradient(135deg, url(https://pirate.test/p.png), #000)')).toBe(false);
    expect(validCover('linear-gradient(135deg, URL (https://pirate.test/p.png), #000)')).toBe(false);
    expect(validCover('linear-gradient(135deg, image-set("https://pirate.test/p.png" 1x), #000)')).toBe(false);
    expect(validCover('linear-gradient(135deg, var(--x), #000)')).toBe(false);
    expect(validCover('linear-gradient(135deg, expression(alert(1)), #000)')).toBe(false);
    expect(validCover('linear-gradient(135deg, \\75rl(https://pirate.test/p.png), #000)')).toBe(false);
    expect(validCover('linear-gradient(#000, #fff); background:url(x)')).toBe(false);
    expect(validCover('linear-gradient(#000, #fff)<script>')).toBe(false);
  });

  it('refuse les autres schémas et les valeurs trop longues ou vides', () => {
    expect(validCover('javascript:alert(1)')).toBe(false);
    expect(validCover('http://exemple.com/a.jpg')).toBe(false);
    expect(validCover('data:image/svg+xml;base64,AAAA')).toBe(false);
    expect(validCover('/api/files/../../etc/passwd')).toBe(false);
    expect(validCover(`linear-gradient(${'#000,'.repeat(200)}#fff)`)).toBe(false);
    expect(validCover(42)).toBe(false);
    expect(validCover(undefined)).toBe(false);
  });
});
