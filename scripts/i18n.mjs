#!/usr/bin/env node
/**
 * Outil i18n d'Event509.
 *
 *   node scripts/i18n.mjs            → liste les phrases sans traduction anglaise
 *   node scripts/i18n.mjs --check    → échoue si une traduction manque, si les variables {x}
 *                                      ne correspondent pas, ou si une entrée n'est plus utilisée
 *   node scripts/i18n.mjs --json     → écrit la liste des phrases manquantes au format JSON
 *
 * Sources des phrases :
 *   - appels t('…') (y compris t(cond ? '…' : '…'))
 *   - libellés déclarés dans des tables (label:, l:, sub:, d:, h:, trigger:, name:)
 *   - listes déclarées (reasons, DOCS, decisions, steps, perms)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Racine du projet : dossier parent du script (ou dossier courant quand le module est chargé par Vitest)
const root = import.meta.url.startsWith('file:') ? join(dirname(fileURLToPath(import.meta.url)), '..') : process.cwd();
const src = join(root, 'src');
const catalogPath = join(src, 'locales', 'en.json');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mjs)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

const STR = `'((?:[^'\\\\]|\\\\.)*)'`;
const unescape = (s) => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');

export function extract() {
  const found = new Map(); // phrase → fichiers
  const add = (s, file) => {
    s = unescape(s);
    if (!s.trim() || !/[A-Za-zÀ-ÿ]/.test(s)) return;
    if (!found.has(s)) found.set(s, new Set());
    found.get(s).add(relative(root, file));
  };
  for (const file of walk(src)) {
    if (file.includes(join('src', 'locales')) || file.endsWith('Legal.tsx')) continue; // Legal : textes bilingues dans le fichier
    const code = readFileSync(file, 'utf8');
    // Données de démonstration : du contenu fictif, pas du texte d'interface
    if (/data[\\/](mock|demo|demo-data)\.ts$/.test(file)) continue;
    for (const m of code.matchAll(new RegExp(`\\bt\\(\\s*${STR}`, 'g'))) add(m[1], file);
    for (const m of code.matchAll(new RegExp(`\\bt\\(\\s*[^'()]*?\\?\\s*${STR}\\s*:\\s*${STR}`, 'g'))) {
      add(m[1], file);
      add(m[2], file);
    }
    for (const m of code.matchAll(new RegExp(`\\b(?:label|l|sub|d|h|trigger|name): ${STR}`, 'g'))) add(m[1], file);
    for (const m of code.matchAll(/const (?:\w+Labels?|reportReason)(?::[^=]+)? = \{([\s\S]*?)\}(?: as const)?;/g))
      for (const s of m[1].matchAll(new RegExp(`(?<!tone): ${STR}`, 'g'))) add(s[1], file); // les teintes (tone) ne sont pas du texte
    for (const m of code.matchAll(/const (?:reasons|DOCS|decisions|steps) = \[([^\]]*)\]/g))
      for (const s of m[1].matchAll(new RegExp(STR, 'g'))) add(s[1], file);
    for (const m of code.matchAll(new RegExp(`\\[${STR}, (?:true|false)`, 'g'))) add(m[1], file);
  }
  return found;
}

/** Phrases qui ne sont pas du texte d'interface (noms propres, marques, codes). */
const IGNORE = new Set(['MonCash', 'NatCash', 'PayPal', 'WhatsApp', 'VIP', 'Event509', 'Live', 'HTG', 'USD', 'CVC', 'Zoom', 'Instagram', 'Facebook', 'X', 'SMS', 'Jakmèl Arts Collectif', 'Konbit Events', 'Saveurs du Nord', 'camera']);

const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

if (import.meta.url.startsWith('file:') && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const found = extract();
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const missing = [...found.keys()].filter((k) => !IGNORE.has(k) && !(k in catalog));
  const badVars = Object.entries(catalog).filter(([k, v]) => vars(k) !== vars(v));
  const unused = Object.keys(catalog).filter((k) => !found.has(k));

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(Object.fromEntries(missing.map((k) => [k, [...found.get(k)].join(', ')])), null, 2));
  } else {
    console.log(`${found.size} phrases trouvées · ${Object.keys(catalog).length} traductions · ${missing.length} manquantes · ${badVars.length} variables incohérentes · ${unused.length} inutilisées`);
    for (const k of missing) console.log(`  manquante : ${k}   (${[...found.get(k)][0]})`);
    for (const [k, v] of badVars) console.log(`  variables : « ${k} » → « ${v} »`);
    for (const k of unused) console.log(`  inutilisée : ${k}`);
  }
  if (process.argv.includes('--check') && (missing.length || badVars.length || unused.length)) process.exit(1);
}
