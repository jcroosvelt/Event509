import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, KeyRound, Lock, Plus, Trash2, Webhook } from 'lucide-react';
import { DEMO, listOrganizerEvents } from '@/services/api';
import { createApiKey, createWebhook, deleteWebhook, getApiUsage, listApiKeys, listWebhooks, revokeApiKey, testWebhook } from '@/services/premium';
import { events as allEvents } from '@/data/mock';
import { ApiError } from '@/lib/errors';
import { orgOf } from '@/lib/permissions';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { relative } from '@/lib/format';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Toggle } from '@/components/ui';

const SCOPE_LABEL: Record<string, string> = { 'events:read': 'Lire mes événements et leurs places', 'sales:read': 'Lire les ventes (chiffres agrégés)' };

/** Bloc de code copiable. */
function Code({ children, label }: { children: string; label: string }) {
  const { t, toast } = useApp();
  return (
    <div className="relative">
      <pre className="whitespace-pre-wrap break-words rounded-2xl bg-navy p-4 pr-12 text-xs leading-relaxed text-white" aria-label={label}><code>{children}</code></pre>
      <button type="button" aria-label={t('Copier : {label}', { label })} onClick={() => navigator.clipboard?.writeText(children).then(() => toast(t('Copié')))} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"><Copy className="h-4 w-4" aria-hidden /></button>
    </div>
  );
}

/** API et intégrations : clés, suivi des requêtes, webhooks signés, widget de billetterie et documentation. */
export default function ApiPage() {
  const { t, toast, user, lang } = useApp();
  useTitle(t('API et intégrations'));
  const orgId = orgOf(user);
  const keys = useAsync(() => (DEMO ? Promise.resolve(null) : listApiKeys()), []);
  const hooks = useAsync(() => (DEMO ? Promise.resolve(null) : listWebhooks()), []);
  const usage = useAsync(() => (DEMO ? Promise.resolve(null) : getApiUsage()), []);
  const evs = useAsync(() => (DEMO ? Promise.resolve(null) : listOrganizerEvents(orgId)), [orgId]);
  const [keyName, setKeyName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['events:read']);
  const [shown, setShown] = useState<{ title: string; secret: string; hint: string } | null>(null);
  const [url, setUrl] = useState('');
  const [hookEvents, setHookEvents] = useState<string[]>(['ticket.sold']);
  const [busy, setBusy] = useState('');
  const [widgetEvent, setWidgetEvent] = useState('');
  const origin = window.location.origin;

  if (DEMO) return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Programme disponible sur le site en ligne')} body={t('L’API nécessite le serveur.')} />;
  if (!keys.data || !hooks.data) return keys.error || hooks.error ? <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Chargement impossible')} body={t('Vérifiez votre connexion puis rechargez la page.')} /> : <Loading />;
  const { canCreate, limits } = keys.data;
  const fail = (e: unknown) => toast(e instanceof ApiError || e instanceof Error ? e.message : t('Action impossible. Réessayez.'), 'error');
  const published = (evs.data ?? []).filter((e) => e.status === 'published');
  const slug = allEvents.find((e) => e.id === widgetEvent)?.slug ?? published.find((e) => e.id === widgetEvent)?.slug ?? '';
  const sample = published[0]?.id ?? 'ID_DE_L_EVENEMENT';

  const addKey = async () => {
    setBusy('key');
    try {
      const r = await createApiKey(keyName.trim(), scopes);
      setShown({ title: t('Votre clé API'), secret: r.key, hint: t('Copiez-la maintenant : pour votre sécurité, elle ne sera plus jamais affichée.') });
      setKeyName('');
      keys.reload();
    } catch (e) { fail(e); } finally { setBusy(''); }
  };
  const addHook = async () => {
    setBusy('hook');
    try {
      const r = await createWebhook(url.trim(), hookEvents);
      setShown({ title: t('Secret de signature du webhook'), secret: r.secret, hint: t('Copiez-le maintenant : il sert à vérifier la signature de chaque envoi et ne sera plus affiché.') });
      setUrl('');
      hooks.reload();
    } catch (e) { fail(e); } finally { setBusy(''); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title={t('API et intégrations')} subtitle={t('Reliez votre billetterie à vos propres outils : clés API, webhooks et widget.')} />
      {!canCreate && (
        <Card className="flex flex-wrap items-center gap-3">
          <Lock className="h-5 w-5 text-ink-muted" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-ink-soft">{t('L’API est réservée aux organisateurs vérifiés. Vous pouvez toujours consulter, désactiver ou supprimer vos clés et webhooks existants.')}</p>
          <Link to="/organisateur-verifie" className="text-sm font-semibold text-brand-ink">{t('Découvrir le programme')}</Link>
        </Card>
      )}

      <section aria-labelledby="h-keys" className="space-y-3">
        <h2 id="h-keys" className="flex items-center gap-2 text-lg font-extrabold"><KeyRound className="h-5 w-5" aria-hidden /> {t('Clés API')}</h2>
        <p className="text-sm text-ink-soft">{t('Limites : {n} requêtes par minute et par clé, {k} clés actives au plus.', { n: limits.perMinute, k: limits.maxKeys })}</p>
        {canCreate && (
          <Card>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label={t('Nom de la clé')}><Input value={keyName} maxLength={60} placeholder={t('Site web')} onChange={(e) => setKeyName(e.target.value)} /></Field>
              <Button loading={busy === 'key'} onClick={addKey}><Plus className="h-4 w-4" aria-hidden /> {t('Créer la clé')}</Button>
            </div>
            <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
              <legend className="mb-1 text-sm font-semibold">{t('Autorisations')}</legend>
              {Object.entries(SCOPE_LABEL).map(([k, l]) => <Toggle key={k} checked={scopes.includes(k)} onChange={(v) => setScopes(v ? [...scopes, k] : scopes.filter((x) => x !== k))} label={t(l)} />)}
            </fieldset>
          </Card>
        )}
        {!keys.data.keys.length ? <p className="text-sm text-ink-muted">{t('Aucune clé pour le moment.')}</p> : (
          <Card className="!p-0 overflow-hidden">
            <Table caption={t('Clés API')} head={[t('Nom'), t('Clé'), t('Autorisations'), t('24 h'), t('Dernier usage'), '']}>
              {keys.data.keys.map((k) => (
                <tr key={k.id}>
                  <Td className="font-semibold">{k.name}{k.revoked && <Badge tone="red" className="ml-2">{t('Révoquée')}</Badge>}</Td>
                  <Td className="font-mono text-xs">{k.prefix}…</Td>
                  <Td className="text-xs text-ink-soft">{k.scopes.join(', ')}</Td>
                  <Td>{k.requests24h}</Td>
                  <Td className="text-ink-soft">{k.lastUsedAt ? relative(k.lastUsedAt, lang) : '—'}</Td>
                  <Td>{!k.revoked && <Button size="sm" variant="ghost" aria-label={t('Révoquer la clé {name}', { name: k.name })} onClick={async () => { await revokeApiKey(k.id).catch(fail); toast(t('Clé révoquée : elle ne fonctionne plus')); keys.reload(); }}><Trash2 className="h-4 w-4" aria-hidden /></Button>}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
        {usage.data && usage.data.length > 0 && (
          <details className="rounded-2xl bg-surface p-4 shadow-card">
            <summary className="cursor-pointer text-sm font-bold">{t('Dernières requêtes ({n})', { n: usage.data.length })}</summary>
            <ul className="mt-3 space-y-1 text-xs">
              {usage.data.map((r, i) => <li key={i} className="flex flex-wrap gap-x-3"><span className="text-ink-muted">{relative(r.at, lang)}</span><span className="font-mono">{r.method} {r.path}</span><Badge tone={r.status < 300 ? 'green' : r.status < 500 ? 'amber' : 'red'}>{r.status}</Badge><span className="text-ink-soft">{r.key}</span></li>)}
            </ul>
          </details>
        )}
      </section>

      <section aria-labelledby="h-hooks" className="space-y-3">
        <h2 id="h-hooks" className="flex items-center gap-2 text-lg font-extrabold"><Webhook className="h-5 w-5" aria-hidden /> {t('Webhooks')}</h2>
        <p className="text-sm text-ink-soft">{t('Event509 envoie une requête signée à votre adresse à chaque événement choisi. Aucune donnée personnelle d’acheteur n’est incluse.')}</p>
        {canCreate && (
          <Card>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label={t('Adresse de réception (https)')}><Input type="url" inputMode="url" value={url} placeholder="https://monsite.ht/webhooks/event509" onChange={(e) => setUrl(e.target.value)} /></Field>
              <Button loading={busy === 'hook'} onClick={addHook}><Plus className="h-4 w-4" aria-hidden /> {t('Ajouter')}</Button>
            </div>
            <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
              <legend className="mb-1 text-sm font-semibold">{t('Événements')}</legend>
              {hooks.data.events.map((ev) => <Toggle key={ev} checked={hookEvents.includes(ev)} onChange={(v) => setHookEvents(v ? [...hookEvents, ev] : hookEvents.filter((x) => x !== ev))} label={ev === 'ticket.sold' ? t('Billets vendus (ticket.sold)') : t('Entrée validée (ticket.checked_in)')} />)}
            </fieldset>
          </Card>
        )}
        {!hooks.data.hooks.length ? <p className="text-sm text-ink-muted">{t('Aucun webhook pour le moment.')}</p> : (
          <ul className="space-y-2">
            {hooks.data.hooks.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 shadow-card">
                <span className="min-w-0 flex-1"><span className="block truncate font-mono text-xs">{h.url}</span><span className="text-xs text-ink-muted">{h.events.join(', ')}</span></span>
                <Badge tone={h.active ? 'green' : 'amber'}>{h.active ? t('Actif') : t('En pause (trop d’échecs)')}</Badge>
                <Button size="sm" variant="soft" onClick={async () => { try { const r = await testWebhook(h.id); toast(r.ok ? t('Envoi de test réussi') : t('Échec du test : {e}', { e: r.error ?? '' }), r.ok ? 'info' : 'error'); hooks.reload(); } catch (e) { fail(e); } }}>{t('Tester')}</Button>
                <Button size="sm" variant="ghost" aria-label={t('Supprimer le webhook')} onClick={async () => { await deleteWebhook(h.id).catch(fail); hooks.reload(); }}><Trash2 className="h-4 w-4" aria-hidden /></Button>
              </li>
            ))}
          </ul>
        )}
        {hooks.data.deliveries.length > 0 && (
          <details className="rounded-2xl bg-surface p-4 shadow-card">
            <summary className="cursor-pointer text-sm font-bold">{t('Derniers envois ({n})', { n: hooks.data.deliveries.length })}</summary>
            <ul className="mt-3 space-y-1 text-xs">
              {hooks.data.deliveries.map((d, i) => <li key={i} className="flex flex-wrap gap-x-3"><span className="text-ink-muted">{relative(d.at, lang)}</span><span className="font-mono">{d.event}</span><Badge tone={d.ok ? 'green' : 'red'}>{d.ok ? d.status : d.error}</Badge></li>)}
            </ul>
          </details>
        )}
      </section>

      <section aria-labelledby="h-widget" className="space-y-3">
        <h2 id="h-widget" className="text-lg font-extrabold">{t('Widget de billetterie')}</h2>
        <p className="text-sm text-ink-soft">{t('Intégrez un événement et ses billets dans votre site. Le paiement se fait sur Event509 : aucune donnée d’acheteur ne passe par votre site.')}</p>
        <Card>
          <Field label={t('Événement')}>
            <Select value={widgetEvent} onChange={(e) => setWidgetEvent(e.target.value)}>
              <option value="">{t('Choisir…')}</option>
              {published.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </Select>
          </Field>
          {slug && (
            <div className="mt-4 space-y-3">
              <Code label={t('Code du widget')}>{`<script src="${origin}/widget.js" data-event="${slug}" async></script>`}</Code>
              <p className="text-xs text-ink-muted">{t('Options : data-theme="dark" pour le thème sombre, data-height="460" pour la hauteur de départ.')}</p>
              <iframe title={t('Aperçu du widget')} src={`${origin}/widget/${slug}`} className="h-[460px] w-full max-w-[420px] rounded-2xl border border-line" />
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="h-docs" className="space-y-3">
        <h2 id="h-docs" className="text-lg font-extrabold">{t('Documentation de l’API')}</h2>
        <Card className="space-y-4 text-sm">
          <p>{t('Authentification : envoyez votre clé dans l’en-tête Authorization. Les réponses sont en JSON. Au-delà de la limite, l’API répond 429.')}</p>
          <Code label="curl">{`curl ${origin}/api/v1/events \\\n  -H "Authorization: Bearer e509_live_VOTRE_CLE"`}</Code>
          <ul className="list-disc space-y-1 pl-5 text-ink-soft">
            <li><code className="font-mono text-xs">GET /api/v1/events</code> — {t('vos événements publiés, avec les billets et les places restantes (autorisation events:read)')}</li>
            <li><code className="font-mono text-xs">GET /api/v1/events/{'{id|slug}'}</code> — {t('un événement (events:read)')}</li>
            <li><code className="font-mono text-xs">GET /api/v1/sales</code> — {t('billets vendus et chiffre d’affaires par événement, chiffres agrégés (sales:read)')}</li>
          </ul>
          <p className="font-semibold">{t('Exemple pour l’événement : {id}', { id: sample })}</p>
          <Code label="curl">{`curl ${origin}/api/v1/events/${sample} \\\n  -H "Authorization: Bearer e509_live_VOTRE_CLE"`}</Code>
          <h3 className="font-bold">{t('Webhooks : vérifier la signature')}</h3>
          <p className="text-ink-soft">{t('Chaque envoi contient l’en-tête X-Event509-Signature : t=horodatage,v1=signature. La signature est le HMAC-SHA256 de « horodatage.corps » avec votre secret. Refusez les envois dont l’horodatage a plus de 5 minutes.')}</p>
          <Code label={t('Vérification en Node.js')}>{`import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, header, secret) {
  const [t, v1] = header.split(',').map((p) => p.split('=')[1]);
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(t + '.' + rawBody).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}`}</Code>
          <Code label={t('Exemple de corps')}>{`{
  "id": "evt_x1y2z3",
  "type": "ticket.sold",
  "createdAt": "2026-11-13T15:04:05.000Z",
  "data": { "orderId": "o_ab12cd", "eventId": "e_123", "tickets": 2, "amount": 2000, "currency": "HTG" }
}`}</Code>
        </Card>
      </section>

      <Modal open={!!shown} onClose={() => setShown(null)} title={shown?.title ?? ''} footer={<Button className="flex-1" onClick={() => setShown(null)}><Check className="h-4 w-4" aria-hidden /> {t('C’est copié, fermer')}</Button>}>
        {shown && (
          <div className="space-y-3">
            <p role="alert" className="text-sm font-semibold text-amber-800 dark:text-amber-300">{shown.hint}</p>
            <Code label={shown.title}>{shown.secret}</Code>
          </div>
        )}
      </Modal>
    </div>
  );
}
