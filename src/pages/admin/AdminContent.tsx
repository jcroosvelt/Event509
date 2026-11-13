import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { currentSiteInfo, getLegalOverrides, saveLegalText, saveSiteInfo, type LegalOverrides } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { isEmail } from '@/lib/form';
import { REQUIRED_SITE_FIELDS, tokensIn, type SiteInfo } from '@/lib/legalDoc';
import { legalDefaults, LEGAL_DOCS, type LegalDoc } from '@/data/legalDefaults';
import { Button, Card, Field, Input, Loading, PageHeader, Segmented, Select, Textarea } from '@/components/ui';
import type { Lang } from '@/types';

const DOCS: Record<LegalDoc, { label: string; to: string }> = {
  terms: { label: 'Conditions d’utilisation', to: '/cgu' },
  privacy: { label: 'Politique de confidentialité', to: '/confidentialite' },
  refund: { label: 'Politique de remboursement', to: '/remboursement' },
};

const FIELDS: { key: keyof SiteInfo; label: string; sub?: string }[] = [
  { key: 'address', label: 'Adresse de JC Multimedia', sub: 'Rue, ville (Haïti est ajouté dans le texte)' },
  { key: 'email', label: 'Email de contact pour les documents légaux' },
  { key: 'sendChannel', label: 'Canal d’envoi des billets', sub: 'Par exemple : email' },
  { key: 'payments', label: 'Moyens de paiement cités' },
  { key: 'resalePercent', label: 'Revente : dépassement maximal du prix d’origine (%)' },
  { key: 'retention', label: 'Conservation des données après fermeture du compte (années)' },
  { key: 'replyDays', label: 'Délai de réponse aux demandes sur les données (jours)' },
  { key: 'refundDelay', label: 'Remboursement d’un événement annulé (jours ouvrables)', sub: 'Par exemple : 7-14' },
  { key: 'postponeDays', label: 'Demande de remboursement après un report (jours)' },
  { key: 'organizerRefundDays', label: 'Politique d’un organisateur : jours avant l’événement', sub: 'Exemple donné dans le texte' },
  { key: 'errorHours', label: 'Signalement d’un double paiement (heures)' },
  { key: 'supportDays', label: 'Réponse du support à une demande (jours ouvrables)' },
];

/** Administration : textes légaux modifiables (français et anglais) et valeurs qui y sont insérées. */
export default function AdminContent() {
  const { toast, t } = useApp();
  useTitle(t('Contenu et réglages'));
  const overrides = useAsync(() => getLegalOverrides().catch((): LegalOverrides => ({})), []);
  const [doc, setDoc] = useState<LegalDoc>('terms');
  const [lang, setLang] = useState<Lang>('fr');
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<SiteInfo>(currentSiteInfo);
  const [infoErr, setInfoErr] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);

  useEffect(() => setDraft(null), [doc, lang]);
  if (overrides.loading) return <Loading />;

  const custom = overrides.data?.[doc]?.[lang];
  const saved = custom ?? legalDefaults[doc][lang];
  const value = draft ?? saved;
  const changed = draft !== null && draft !== saved;
  const missing = REQUIRED_SITE_FIELDS.filter((k) => !info[k].trim());
  const unset = tokensIn(value).filter((k) => !(info as unknown as Record<string, string>)[k]?.trim() && k !== 'commission');

  const saveText = async (text: string | null) => {
    setBusy(true);
    try {
      await saveLegalText(doc, lang, text);
      await overrides.reload();
      setDraft(null);
      toast(text === null ? t('Texte d’origine rétabli') : t('Texte enregistré : la page est à jour'));
    } catch {
      toast(t('Le texte n’a pas pu être enregistré.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveInfo = async () => {
    if (info.email.trim() && !isEmail(info.email.trim())) return setInfoErr(t('Saisissez une adresse comme nom@domaine.com'));
    setInfoErr('');
    setSavingInfo(true);
    try {
      await saveSiteInfo(Object.fromEntries(Object.entries(info).map(([k, v]) => [k, v.trim()])) as unknown as SiteInfo);
      toast(t('Valeurs enregistrées : les pages légales sont à jour'));
    } catch {
      toast(t('Les valeurs n’ont pas pu être enregistrées.'), 'error');
    } finally {
      setSavingInfo(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title={t('Contenu et réglages')} subtitle={t('Modifiez les pages légales, les valeurs qu’elles contiennent, la commission et le taux de change.')} />

      <Card className="mb-4">
        <h2 className="font-bold">{t('Valeurs insérées dans les documents légaux')}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t('Ces valeurs remplacent les mentions {tok} des textes ci-dessous, en français et en anglais. La commission se règle dans Commissions.', { tok: '{{…}}' })}</p>
        {missing.length > 0 && (
          <p role="status" className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {t('À renseigner pour que les documents soient complets : {list}', { list: missing.map((k) => t(FIELDS.find((f) => f.key === k)!.label)).join(' · ') })}
          </p>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <Field key={f.key} label={t(f.label)} hint={f.sub ? t(f.sub) : undefined} error={f.key === 'email' ? infoErr : undefined} className={f.key === 'address' || f.key === 'payments' ? 'sm:col-span-2' : undefined}>
              <Input value={info[f.key]} onChange={(e) => setInfo({ ...info, [f.key]: e.target.value })} maxLength={160} />
            </Field>
          ))}
        </div>
        <Button className="mt-4" onClick={saveInfo} loading={savingInfo}>{t('Enregistrer les valeurs')}</Button>
      </Card>

      <Card>
        <h2 className="font-bold">{t('Textes des pages légales')}</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label={t('Document')} className="w-full sm:w-72">
            <Select value={doc} onChange={(e) => setDoc(e.target.value as LegalDoc)}>
              {LEGAL_DOCS.map((d) => <option key={d} value={d}>{t(DOCS[d].label)}</option>)}
            </Select>
          </Field>
          <Segmented label={t('Langue')} value={lang} onChange={(v) => setLang(v as Lang)} options={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]} />
          <Link to={DOCS[doc].to} target="_blank" className="inline-flex items-center gap-1.5 pb-3 text-sm font-semibold text-brand-ink">
            <ExternalLink className="h-4 w-4" aria-hidden /> {t('Voir la page')}
          </Link>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          {t('Écriture : « # » titre du document, « > » ligne de mise à jour, « ## » titre de section, « - » puce, sinon paragraphe. {a}, {b}… sont remplacés par les valeurs ci-dessus.', { a: '{{email}}', b: '{{commission}}' })}
        </p>
        <Field label={custom ? t('Texte modifié par vous') : t('Texte d’origine')} className="mt-3">
          <Textarea value={value} onChange={(e) => setDraft(e.target.value)} rows={22} spellCheck lang={lang} className="font-mono text-[13px] leading-relaxed" />
        </Field>
        {unset.length > 0 && (
          <p role="status" className="mt-2 flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('Valeurs encore vides dans ce texte : {list}', { list: unset.map((k) => `{{${k}}}`).join(', ') })}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => saveText(value)} loading={busy} disabled={!changed}>{t('Enregistrer le texte')}</Button>
          {changed && <Button variant="outline" onClick={() => setDraft(null)}>{t('Annuler les modifications')}</Button>}
          {custom && <Button variant="outline" onClick={() => saveText(null)} disabled={busy}>{t('Rétablir le texte d’origine')}</Button>}
        </div>
      </Card>
    </div>
  );
}
