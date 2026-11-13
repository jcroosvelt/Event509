import { useEffect, useState } from 'react';
import { BadgeCheck, Eye, FileText, History, Image as ImageIcon, X } from 'lucide-react';
import { decideVerification, DEMO, fetchPrivateFile, listVerificationRequests } from '@/services/api';
import { commentVerification, getVerificationLog, type AdminVerification } from '@/services/premium';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateShort, moneyRaw, relative } from '@/lib/format';
import { Avatar, Badge, Button, Card, EmptyState, Field, Loading, Modal, PageHeader, Segmented, Spinner, Textarea, Toggle, type Tone } from '@/components/ui';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import type { VerificationDocType, VerificationLogEntry, VerificationStatus } from '@/types';

const docLabels: Record<VerificationDocType, string> = {
  id: 'Pièce d’identité', selfie: 'Selfie de vérification', registration: 'Document d’enregistrement', representation: 'Représentation légale', license: 'Patente / NIF', bank: 'Justificatif bancaire',
};
const statusTone: Record<VerificationStatus, { l: string; tone: Tone }> = {
  draft: { l: 'Brouillon', tone: 'gray' },
  pending: { l: 'En attente', tone: 'amber' },
  in_review: { l: 'En cours de vérification', tone: 'brand' },
  docs_requested: { l: 'Documents requis', tone: 'violet' },
  approved: { l: 'Vérifié', tone: 'green' },
  rejected: { l: 'Refusé', tone: 'red' },
  suspended: { l: 'Suspendu', tone: 'amber' },
  expired: { l: 'Expiré', tone: 'gray' },
};
const orgTypeLabels: Record<string, string> = { company: 'Entreprise', association: 'Association', institution: 'Institution', agency: 'Agence événementielle', independent: 'Indépendant' };

type Action = 'in_review' | 'docs_requested' | 'approved' | 'rejected' | 'suspended' | 'revoked' | 'reinstated';
const actionLabels: Record<Action, string> = {
  in_review: 'Prendre en charge', docs_requested: 'Demander des documents', approved: 'Approuver la demande', rejected: 'Refuser la demande',
  suspended: 'Suspendre la vérification', revoked: 'Révoquer la certification', reinstated: 'Rétablir la vérification',
};
const NOTE_REQUIRED: Action[] = ['docs_requested', 'rejected', 'suspended', 'revoked'];
const CHECKS: { k: 'identity' | 'email' | 'phone' | 'presence'; l: string }[] = [
  { k: 'identity', l: 'Identité vérifiée' }, { k: 'email', l: 'Adresse email valide' }, { k: 'phone', l: 'Téléphone valide' }, { k: 'presence', l: 'Présence professionnelle vérifiable' },
];

/** Aperçu d'un document privé : lu avec la session de l'administrateur, jamais par une adresse publique. */
function DocPreview({ fileId, name }: { fileId: string; name: string }) {
  const { t } = useApp();
  const [state, setState] = useState<{ url: string; mime: string } | 'error' | null>(null);
  useEffect(() => {
    let url = '';
    let alive = true;
    setState(null);
    fetchPrivateFile(fileId)
      .then((b) => {
        url = URL.createObjectURL(b);
        if (alive) setState({ url, mime: b.type });
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId]);
  if (state === null) return <div className="grid aspect-[4/3] place-items-center rounded-2xl bg-canvas ring-1 ring-line"><Spinner /></div>;
  if (state === 'error') return <div role="alert" className="grid aspect-[4/3] place-items-center rounded-2xl bg-canvas p-6 text-center text-sm text-ink-soft ring-1 ring-line">{t('Le document n’a pas pu être chargé. Réessayez.')}</div>;
  return state.mime === 'application/pdf' ? (
    <iframe title={name} src={state.url} className="aspect-[4/3] w-full rounded-2xl bg-canvas ring-1 ring-line" />
  ) : (
    <img src={state.url} alt={name} className="max-h-[70vh] w-full rounded-2xl bg-canvas object-contain ring-1 ring-line" />
  );
}

export default function Verification() {
  const { toast, t, lang } = useApp();
  useTitle(t('Vérification des organisateurs'));
  const { data, loading, reload } = useAsync(() => listVerificationRequests() as Promise<AdminVerification[]>, []);
  const [tab, setTab] = useState<'todo' | 'active' | 'closed'>('todo');
  const [viewing, setViewing] = useState<{ req: AdminVerification; file: string; fileId?: string; label: string } | null>(null);
  const [acting, setActing] = useState<{ req: AdminVerification; action: Action } | null>(null);
  const [history, setHistory] = useState<AdminVerification | null>(null);
  const [note, setNote] = useState('');
  const [checks, setChecks] = useState({ identity: false, email: false, phone: false, presence: false });
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  const all = data ?? [];
  const group = (s: VerificationStatus) => (['pending', 'in_review', 'docs_requested'].includes(s) ? 'todo' : ['approved', 'suspended', 'expired'].includes(s) ? 'active' : 'closed');
  const shown = all.filter((v) => group(v.status) === tab);
  const count = (g: string) => all.filter((v) => group(v.status) === g).length;

  const start = (req: AdminVerification, action: Action) => {
    setActing({ req, action });
    setNote('');
    setChecks({ identity: false, email: false, phone: false, presence: false });
  };
  const run = async () => {
    if (!acting) return;
    const { req, action } = acting;
    if (NOTE_REQUIRED.includes(action) && note.trim().length < 5) return toast(t('Expliquez la décision : elle est communiquée à l’organisateur'), 'error');
    if (action === 'approved' && Object.values(checks).some((c) => !c)) return toast(t('Cochez les quatre contrôles avant d’approuver'), 'error');
    setBusy(true);
    try {
      await decideVerification(req.id, action, note.trim() || undefined, action === 'approved' ? checks : undefined);
      toast(t('Décision enregistrée : {name}', { name: req.name }));
      setActing(null);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('La décision n’a pas pu être enregistrée'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const buttons = (v: AdminVerification): Action[] =>
    v.status === 'pending' ? ['in_review', 'docs_requested', 'rejected', 'approved']
    : v.status === 'in_review' || v.status === 'docs_requested' ? ['docs_requested', 'rejected', 'approved']
    : v.status === 'approved' ? ['suspended', 'revoked']
    : v.status === 'suspended' ? ['reinstated', 'revoked']
    : [];

  return (
    <div>
      <PageHeader title={t('Vérification des organisateurs')} subtitle={t('Contrôlez l’identité et les documents avant d’attribuer le badge. Chaque décision est enregistrée à votre nom.')} />
      <Segmented label={t('Filtre')} className="mb-5" value={tab} onChange={setTab} options={[
        { value: 'todo', label: t('À traiter ({n})', { n: count('todo') }) }, { value: 'active', label: t('Certifiés ({n})', { n: count('active') }) }, { value: 'closed', label: t('Refusés ({n})', { n: count('closed') }) },
      ]} />
      {!shown.length ? (
        <EmptyState icon={<BadgeCheck className="h-5 w-5" />} title={t('Aucune demande')} />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {shown.map((v) => {
            const a = v.application;
            const paid = v.subscription?.status === 'active';
            return (
              <li key={v.id}>
                <Card className="h-full">
                  <div className="flex items-center gap-3">
                    <Avatar name={v.name} size={48} />
                    <div className="min-w-0 flex-1">
                      <h2 className="flex items-center gap-1 font-bold">{v.name} {v.status === 'approved' && paid && <VerifiedBadge size={16} />}</h2>
                      <p className="truncate text-sm text-ink-muted">{v.owner} · {v.email}</p>
                      <p className="text-xs text-ink-muted">{t('Demande envoyée {when}', { when: relative(v.submittedAt, lang) })}</p>
                    </div>
                    <Badge tone={statusTone[v.status].tone}>{t(statusTone[v.status].l)}</Badge>
                  </div>

                  {a && (
                    <dl className="mt-4 grid gap-2 rounded-2xl bg-canvas p-3 text-sm sm:grid-cols-2">
                      <div><dt className="text-xs text-ink-muted">{t('Naissance · pays')}</dt><dd>{a.birthDate} · {a.country}</dd></div>
                      <div><dt className="text-xs text-ink-muted">{t('Téléphone')}</dt><dd>{a.phone}</dd></div>
                      <div><dt className="text-xs text-ink-muted">{t('Type')}</dt><dd>{a.orgType ? t(orgTypeLabels[a.orgType] ?? a.orgType) : '—'}</dd></div>
                      <div className="min-w-0"><dt className="text-xs text-ink-muted">{t('Site · réseaux')}</dt><dd className="truncate">{[a.website, a.socials?.split('\n')[0]].filter(Boolean).join(' · ') || '—'}</dd></div>
                      <div className="sm:col-span-2"><dt className="text-xs text-ink-muted">{t('Activité')}</dt><dd className="line-clamp-3">{a.activity}</dd></div>
                    </dl>
                  )}

                  <ul className="mt-4 space-y-2">
                    {v.docs.length === 0 && <li className="rounded-2xl bg-canvas p-3 text-sm text-red-700"><X className="mr-1 inline h-4 w-4" aria-hidden />{t('Aucun document')}</li>}
                    {v.docs.map((d) => (
                      <li key={d.type} className="flex items-center gap-3 rounded-2xl bg-canvas p-3 text-sm">
                        <FileText className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{t(docLabels[d.type] ?? d.type)}</span>
                          <span className="block truncate text-xs text-ink-muted">{d.file} · {dateShort(d.uploadedAt, lang)}</span>
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => setViewing({ req: v, file: d.file, fileId: d.fileId, label: t(docLabels[d.type] ?? d.type) })} aria-label={t('Voir {doc}', { doc: t(docLabels[d.type] ?? d.type) })}><Eye className="h-4 w-4" aria-hidden /></Button>
                      </li>
                    ))}
                  </ul>

                  {!DEMO && (
                    <p className="mt-3 text-xs text-ink-muted">
                      {t('Abonnement')} : {v.subscription ? t(v.subscription.status === 'active' ? 'actif' : v.subscription.status === 'pending_payment' ? 'paiement en attente' : v.subscription.status === 'canceled' ? 'résilié' : v.subscription.status === 'expired' ? 'expiré' : 'suspendu') : t('aucun')}
                      {v.payments?.[0] && ` · ${moneyRaw(v.payments[0].amount, 'HTG', lang)} (${t(v.payments[0].status === 'paid' ? 'payé' : v.payments[0].status === 'pending' ? 'en attente' : v.payments[0].status === 'refund_due' ? 'à rembourser' : v.payments[0].status)})`}
                    </p>
                  )}
                  {v.appeal && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800"><b>{t('Recours')} :</b> {v.appeal.message}</p>}
                  {v.note && <p className="mt-3 rounded-2xl bg-violet-50 p-3 text-xs text-violet-600">{v.note}</p>}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {buttons(v).map((ac) => (
                      <Button key={ac} size="sm" variant={ac === 'approved' || ac === 'reinstated' ? 'primary' : ac === 'rejected' || ac === 'revoked' ? 'ghost' : 'outline'} onClick={() => start(v, ac)}>{t(actionLabels[ac])}</Button>
                    ))}
                    {!DEMO && <Button size="sm" variant="soft" className="ml-auto" onClick={() => setHistory(v)}><History className="h-4 w-4" aria-hidden /> {t('Historique')}</Button>}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!acting}
        onClose={() => setActing(null)}
        title={acting ? `${t(actionLabels[acting.action])} — ${acting.req.name}` : ''}
        footer={<><Button variant="ghost" className="flex-1" onClick={() => setActing(null)}>{t('Annuler')}</Button><Button className="flex-1" loading={busy} onClick={run}>{t('Confirmer')}</Button></>}
      >
        {acting && (
          <div className="space-y-4">
            {acting.action === 'approved' && (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-semibold">{t('Contrôles effectués')}</legend>
                {CHECKS.map((c) => <Toggle key={c.k} checked={checks[c.k]} onChange={(v) => setChecks({ ...checks, [c.k]: v })} label={t(c.l)} />)}
                <p className="text-xs text-ink-muted">{t('Le badge s’affichera automatiquement dès que l’abonnement de l’organisateur est actif.')}</p>
              </fieldset>
            )}
            <Field label={NOTE_REQUIRED.includes(acting.action) ? t('Motif (communiqué à l’organisateur)') : t('Commentaire (facultatif)')} required={NOTE_REQUIRED.includes(acting.action)}>
              <Textarea rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {acting.action === 'rejected' && <p className="text-xs text-ink-muted">{t('Le remboursement éventuel suit la politique configurée dans « Programme vérifié ». Vous serez invité à le marquer comme effectué.')}</p>}
          </div>
        )}
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `${viewing.label} — ${viewing.req.name}` : ''} size="lg">
        {viewing && (
          <figure>
            {viewing.fileId && !DEMO ? (
              <DocPreview fileId={viewing.fileId} name={viewing.file} />
            ) : (
              <div className="grid aspect-[4/3] place-items-center rounded-2xl bg-canvas ring-1 ring-line">
                <div className="text-center text-ink-muted">
                  {viewing.file.endsWith('.pdf') ? <FileText className="mx-auto h-14 w-14" aria-hidden /> : <ImageIcon className="mx-auto h-14 w-14" aria-hidden />}
                  <p className="mt-3 font-mono text-sm">{viewing.file}</p>
                  <p className="mt-1 text-xs">{t('Aperçu indisponible en démonstration.')}</p>
                </div>
              </div>
            )}
            <figcaption className="mt-3 text-sm text-ink-soft">{viewing.req.owner} · {viewing.req.email} — {t('Cette consultation est enregistrée.')}</figcaption>
          </figure>
        )}
      </Modal>

      {history && <HistoryModal req={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

/** Décisions, commentaires internes et consultations de documents d'un dossier. */
function HistoryModal({ req, onClose }: { req: AdminVerification; onClose: () => void }) {
  const { t, toast, lang } = useApp();
  const [tick, setTick] = useState(0);
  const [note, setNote] = useState('');
  const { data, loading } = useAsync(() => getVerificationLog(req.id), [req.id, tick]);
  const add = async () => {
    if (!note.trim()) return;
    try {
      await commentVerification(req.id, note.trim());
      setNote('');
      setTick((n) => n + 1);
    } catch {
      toast(t('Le commentaire n’a pas pu être enregistré'), 'error');
    }
  };
  return (
    <Modal open onClose={onClose} title={`${t('Historique')} — ${req.name}`} size="lg">
      <div className="space-y-4">
        <div className="flex gap-2">
          <label htmlFor="vh-note" className="sr-only">{t('Commentaire interne')}</label>
          <textarea id="vh-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Commentaire interne (invisible pour l’organisateur)')} className="min-h-11 flex-1 rounded-2xl border border-line bg-surface p-3 text-sm outline-none focus:border-brand" />
          <Button onClick={add}>{t('Ajouter')}</Button>
        </div>
        {loading && !data ? <Loading /> : (
          <>
            <ul className="space-y-2">
              {(data?.log ?? []).map((l: VerificationLogEntry) => (
                <li key={l.id} className={`rounded-2xl p-3 text-sm ${l.internal ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-canvas'}`}>
                  <div className="flex flex-wrap justify-between gap-2"><b>{t(l.action)}{l.internal && ` (${t('interne')})`}</b><span className="text-xs text-ink-muted">{new Date(l.at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')} · {l.actor}</span></div>
                  {l.note && <p className="mt-1 text-ink-soft">{l.note}</p>}
                </li>
              ))}
              {!data?.log.length && <li className="text-sm text-ink-muted">{t('Aucune décision enregistrée.')}</li>}
            </ul>
            <div>
              <h3 className="mb-2 text-sm font-bold">{t('Consultations de documents')}</h3>
              <ul className="space-y-1 text-xs text-ink-soft">
                {(data?.views ?? []).map((x) => <li key={x.id}>{new Date(x.at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')} — {x.admin}</li>)}
                {!data?.views.length && <li>{t('Aucune consultation.')}</li>}
              </ul>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
