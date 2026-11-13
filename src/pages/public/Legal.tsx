import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { currentFeeSettings, currentSiteInfo, getLegalOverrides, type LegalOverrides } from '@/services/api';
import { useApp } from '@/store/app';
import { useAsync, useTitle } from '@/lib/hooks';
import { fillTokens, parseDoc, type Block } from '@/lib/legalDoc';
import { legalDefaults, type LegalDoc } from '@/data/legalDefaults';
import { Card, Loading } from '@/components/ui';

// Ce fichier est exclu du contrôle des traductions : les libellés sont donc écrits dans les deux langues ici
const PAGES: { id: LegalDoc; to: string; fr: string; en: string }[] = [
  { id: 'terms', to: '/cgu', fr: 'Conditions d’utilisation', en: 'Terms of use' },
  { id: 'privacy', to: '/confidentialite', fr: 'Politique de confidentialité', en: 'Privacy policy' },
  { id: 'refund', to: '/remboursement', fr: 'Politique de remboursement', en: 'Refund policy' },
];

/** Regroupe les puces consécutives dans une même liste. */
function groups(blocks: Block[]) {
  const out: (Block | { kind: 'ul'; items: string[] })[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (b.kind === 'li' && last && last.kind === 'ul') last.items.push(b.text);
    else if (b.kind === 'li') out.push({ kind: 'ul', items: [b.text] });
    else out.push(b);
  }
  return out;
}

/**
 * Pages légales (conditions, confidentialité, remboursement). Le texte vient d'abord des modifications de
 * l'administrateur (Administration > Contenu et réglages), sinon du texte d'origine du site (src/data/legalDefaults.ts).
 */
export default function Legal({ page }: { page: LegalDoc }) {
  const { lang } = useApp();
  const { data, loading } = useAsync(() => getLegalOverrides().catch((): LegalOverrides => ({})), []);
  const raw = data?.[page]?.[lang] ?? legalDefaults[page][lang];
  const values = { ...currentSiteInfo(), commission: String(currentFeeSettings().percent) };
  const doc = parseDoc(fillTokens(raw, values, lang));
  useTitle(doc.title);
  if (loading) return <Loading />;
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 lg:pt-12">
      <Card className="p-6 sm:p-10">
        <h1 className="text-3xl font-extrabold tracking-tight">{doc.title}</h1>
        <div className="mt-8 space-y-3">
          {groups(doc.blocks).map((b, i) => (
            <Fragment key={i}>
              {b.kind === 'note' && <p className="-mt-6 mb-6 text-sm text-ink-muted">{b.text}</p>}
              {b.kind === 'h' && <h2 className="!mt-8 text-lg font-bold">{b.text}</h2>}
              {b.kind === 'p' && <p className="leading-relaxed text-ink-soft">{b.text}</p>}
              {b.kind === 'ul' && (
                <ul className="list-disc space-y-1.5 pl-6 leading-relaxed text-ink-soft marker:text-ink-muted">
                  {b.items.map((it, j) => <li key={j}>{it}</li>)}
                </ul>
              )}
            </Fragment>
          ))}
        </div>
      </Card>
      <nav aria-label={lang === 'en' ? 'Legal documents' : 'Documents légaux'} className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 pb-4 text-sm font-semibold">
        {PAGES.filter((p) => p.id !== page).map((p) => <Link key={p.id} to={p.to} className="text-brand-ink hover:underline">{p[lang]}</Link>)}
      </nav>
    </div>
  );
}
