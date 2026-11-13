import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Send } from 'lucide-react';
import { DEMO } from '@/services/api';
import { getAudience, sendCampaign } from '@/services/premium';
import { events, organizers } from '@/data/mock';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { orgOf } from '@/lib/permissions';
import { Button, Card, Field, Input, Select, Textarea, Toggle } from '@/components/ui';

/**
 * Envoi réel d'une campagne (avantage « outils marketing ») : uniquement aux acheteurs qui ont coché la case de
 * consentement à l'achat et ne se sont pas désinscrits. Chaque email contient un lien de désinscription.
 */
export function CampaignSend() {
  const { t, toast, user } = useApp();
  const orgId = orgOf(user);
  const perks = organizers.find((o) => o.id === orgId)?.perks;
  const [eventId, setEventId] = useState('');
  const [f, setF] = useState({ name: '', subject: '', body: '' });
  const [email, setEmail] = useState(true);
  const [push, setPush] = useState(false);
  const [busy, setBusy] = useState(false);
  const aud = useAsync(() => (DEMO || !perks?.includes('marketing') ? Promise.resolve(null) : getAudience(eventId)), [eventId, perks?.length]);
  if (DEMO) return null;
  if (!perks?.includes('marketing'))
    return (
      <Card className="mb-6 flex flex-wrap items-center gap-3">
        <Lock className="h-5 w-5 text-ink-muted" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-ink-soft">{t('Envoyez de vraies campagnes à vos acheteurs consentants avec le programme Organisateur vérifié.')}</p>
        <Link to="/organisateur-verifie" className="text-sm font-semibold text-brand-ink">{t('Découvrir le programme')}</Link>
      </Card>
    );
  const mine = events.filter((e) => orgId === e.organizerId);
  const a = aud.data;
  const send = async () => {
    setBusy(true);
    try {
      const channels = [email && 'email', push && 'push'].filter(Boolean) as string[];
      const r = await sendCampaign({ ...f, eventId, channels });
      toast(t('Campagne envoyée à {n} personne(s)', { n: r.recipients }));
      setF({ name: '', subject: '', body: '' });
      aud.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Envoi impossible. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mb-6">
      <h2 className="font-bold">{t('Envoyer une campagne')}</h2>
      <p className="mt-1 text-sm text-ink-soft">{t('Seuls les acheteurs qui ont accepté de recevoir vos actualités sont contactés, et chacun peut se désinscrire en un clic.')}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={t('Audience')}>
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">{t('Tous mes acheteurs consentants')}</option>
            {mine.map((e) => <option key={e.id} value={e.id}>{t('Acheteurs de {event}', { event: e.title })}</option>)}
          </Select>
        </Field>
        <p role="status" className="self-end rounded-2xl bg-canvas p-3 text-sm">{a ? t('{n} destinataire(s) consentant(s) sur {total} acheteur(s)', { n: a.consenting, total: a.buyers }) : '…'}</p>
        <Field label={t('Nom de la campagne')}><Input maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t('Objet')}><Input maxLength={140} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
        <Field label={t('Message')} className="sm:col-span-2"><Textarea rows={5} maxLength={5000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Toggle checked={email} onChange={setEmail} label={t('Email')} description={a && !a.mailConfigured ? t('Pas encore activé sur la plateforme') : undefined} />
        <Toggle checked={push} onChange={setPush} label={t('Notification sur l’application')} description={a && !a.pushConfigured ? t('Pas encore activé sur la plateforme') : undefined} />
      </div>
      <Button className="mt-4" loading={busy} disabled={!a?.consenting} onClick={send}><Send className="h-4 w-4" aria-hidden /> {t('Envoyer maintenant')}</Button>
    </Card>
  );
}
