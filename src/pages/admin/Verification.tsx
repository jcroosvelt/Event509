import { useEffect, useState } from 'react';
import { BadgeCheck, Check, Eye, FileText, Image as ImageIcon, X } from 'lucide-react';
import { decideVerification, DEMO, fetchPrivateFile, listVerificationRequests } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateShort, relative } from '@/lib/format';
import { useForm } from '@/lib/form';
import { Avatar, Badge, Button, Card, EmptyState, Field, Loading, Modal, PageHeader, Segmented, Spinner, Textarea, type Tone } from '@/components/ui';
import type { VerificationRequest } from '@/types';

const DOCS: { type: VerificationRequest['docs'][number]['type']; label: string }[] = [
  { type: 'id', label: 'Pièce d’identité' },
  { type: 'license', label: 'Patente / NIF' },
  { type: 'bank', label: 'Justificatif bancaire' },
];
const statusTone: Record<VerificationRequest['status'], { l: string; tone: Tone }> = {
  pending: { l: 'À vérifier', tone: 'amber' },
  docs_requested: { l: 'Documents demandés', tone: 'violet' },
  approved: { l: 'Vérifié', tone: 'green' },
  rejected: { l: 'Refusé', tone: 'red' },
};

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
  const { data, loading, reload } = useAsync(() => listVerificationRequests(), []);
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [viewing, setViewing] = useState<{ req: VerificationRequest; file: string; fileId?: string; label: string } | null>(null);
  const [asking, setAsking] = useState<VerificationRequest | null>(null);
  const form = useForm({ note: '' }, { note: (v) => (String(v).trim().length < 5 ? t('Précisez les documents à fournir') : undefined) });

  if (loading) return <Loading />;
  const all = data ?? [];
  const shown = all.filter((v) => (tab === 'pending' ? v.status === 'pending' || v.status === 'docs_requested' : v.status === 'approved' || v.status === 'rejected'));

  const decide = async (v: VerificationRequest, status: VerificationRequest['status'], note?: string) => {
    await decideVerification(v.id, status, note);
    toast(status === 'approved' ? t('{name} est vérifié', { name: v.name }) : status === 'docs_requested' ? t('Documents demandés à {name}', { name: v.name }) : t('Demande de {name} refusée : l’organisateur est prévenu', { name: v.name }));
    setAsking(null);
    reload();
  };

  return (
    <div>
      <PageHeader title={t('Vérification des organisateurs')} subtitle={t('Contrôlez les documents avant d’attribuer le badge vérifié.')} />
      <Segmented label={t('Filtre')} className="mb-5" value={tab} onChange={setTab} options={[{ value: 'pending', label: t('À vérifier ({n})', { n: all.filter((v) => v.status === 'pending').length }) }, { value: 'done', label: t('Traitées') }]} />
      {!shown.length ? (
        <EmptyState icon={<BadgeCheck className="h-5 w-5" />} title={t('Aucune demande')} />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {shown.map((v) => {
            const complete = DOCS.every((d) => v.docs.some((x) => x.type === d.type));
            return (
              <li key={v.id}>
                <Card className="h-full">
                  <div className="flex items-center gap-3">
                    <Avatar name={v.name} size={48} />
                    <div className="min-w-0 flex-1">
                      <h2 className="flex items-center gap-1 font-bold">{v.name} {v.status === 'approved' && <BadgeCheck className="h-4 w-4 text-brand-ink" aria-label={t('Vérifié')} />}</h2>
                      <p className="truncate text-sm text-ink-muted">{v.owner} · {v.city} · {v.email}</p>
                      <p className="text-xs text-ink-muted">{t('Demande envoyée {when}', { when: relative(v.submittedAt, lang) })}</p>
                    </div>
                    <Badge tone={statusTone[v.status].tone}>{t(statusTone[v.status].l)}</Badge>
                  </div>
                  <ul className="mt-4 space-y-2">
                    {DOCS.map((d) => {
                      const doc = v.docs.find((x) => x.type === d.type);
                      return (
                        <li key={d.type} className="flex items-center gap-3 rounded-2xl bg-canvas p-3 text-sm">
                          {doc ? <FileText className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden /> : <X className="h-4 w-4 shrink-0 text-red-700" aria-hidden />}
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{t(d.label)}</span>
                            <span className="block truncate text-xs text-ink-muted">{doc ? `${doc.file} · ${dateShort(doc.uploadedAt, lang)}` : t('manquant')}</span>
                          </span>
                          {doc && <Button size="sm" variant="ghost" onClick={() => setViewing({ req: v, file: doc.file, fileId: doc.fileId, label: t(d.label) })} aria-label={t('Voir {doc}', { doc: t(d.label) })}><Eye className="h-4 w-4" aria-hidden /></Button>}
                        </li>
                      );
                    })}
                  </ul>
                  {v.note && <p className="mt-3 rounded-2xl bg-violet-50 p-3 text-xs text-violet-600">{v.note}</p>}
                  {(v.status === 'pending' || v.status === 'docs_requested') && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="ghost" onClick={() => decide(v, 'rejected')}>{t('Refuser')}</Button>
                      <Button variant="outline" className="flex-1" onClick={() => { form.reset({ note: complete ? '' : t('Merci d’envoyer : {docs}.', { docs: DOCS.filter((d) => !v.docs.some((x) => x.type === d.type)).map((d) => t(d.label).toLowerCase()).join(', ') }) }); setAsking(v); }}>{t('Demander des documents')}</Button>
                      <Button className="flex-1" onClick={() => (complete ? decide(v, 'approved') : toast(t('Des documents manquent : demandez-les avant de vérifier'), 'info'))}><Check className="h-4 w-4" aria-hidden /> {t('Vérifier')}</Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

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
            <figcaption className="mt-3 text-sm text-ink-soft">{viewing.req.owner} · {viewing.req.email}</figcaption>
          </figure>
        )}
      </Modal>

      <Modal open={!!asking} onClose={() => setAsking(null)} title={t('Demander des documents à {name}', { name: asking?.name ?? '' })} size="sm" footer={<Button className="flex-1" onClick={() => asking && form.validate() && decide(asking, 'docs_requested', form.values.note)}>{t('Envoyer la demande')}</Button>}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); if (asking && form.validate()) decide(asking, 'docs_requested', form.values.note); }}>
          <Field label={t('Message à l’organisateur')} error={form.errors.note} required><Textarea {...form.bind('note')} /></Field>
        </form>
      </Modal>
    </div>
  );
}
