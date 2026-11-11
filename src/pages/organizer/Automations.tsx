import { useState } from 'react';
import { Bell, CalendarClock, CheckCircle2, Mail, MessageCircle, Pencil, RefreshCcw, Star } from 'lucide-react';
import { load, persist, useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { useForm } from '@/lib/form';
import { Badge, Button, Card, Field, IconBadge, Input, Modal, PageHeader, Textarea, Toggle, type Tone } from '@/components/ui';

interface Auto {
  id: string;
  name: string;
  trigger: string;
  on: boolean;
  whatsapp: boolean;
  subject: string;
  body: string;
}

const icons: Record<string, { i: typeof Mail; tone: Tone }> = {
  confirm: { i: CheckCircle2, tone: 'green' },
  remind7: { i: CalendarClock, tone: 'brand' },
  remind1: { i: Bell, tone: 'orange' },
  update: { i: RefreshCcw, tone: 'amber' },
  thanks: { i: Star, tone: 'violet' },
};

const defaults: Auto[] = [
  { id: 'confirm', name: 'Confirmation de commande', trigger: 'Immédiatement après l’achat', on: true, whatsapp: true, subject: 'Vos billets pour {evenement}', body: 'Bonjour {prenom},\n\nMerci pour votre achat ! Vos billets sont en pièce jointe et dans l’app Event509.\n\nÀ bientôt !' },
  { id: 'remind7', name: 'Rappel J-7', trigger: '7 jours avant l’événement', on: true, whatsapp: false, subject: '{evenement}, c’est dans une semaine !', body: 'Bonjour {prenom}, on se retrouve le {date} à {lieu}.' },
  { id: 'remind1', name: 'Rappel J-1', trigger: '24 h avant l’événement', on: true, whatsapp: true, subject: 'C’est demain : {evenement}', body: 'Préparez votre QR code ! Ouverture des portes : {heure}.' },
  { id: 'update', name: 'Mise à jour de l’événement', trigger: 'Quand vous modifiez la date, l’heure ou le lieu', on: true, whatsapp: true, subject: 'Changement : {evenement}', body: 'Bonjour {prenom}, une information importante concernant {evenement} : {details}' },
  { id: 'thanks', name: 'Remerciement et avis', trigger: 'Le lendemain de l’événement', on: false, whatsapp: false, subject: 'Merci d’être venu !', body: 'Merci {prenom} ! Donnez-nous votre avis en 30 secondes : {lien}' },
];

const KEY = 'e509.automations';

export default function Automations() {
  const { toast, t, user } = useApp();
  useTitle(t('Emails automatiques'));
  const [list, setListState] = useState<Auto[]>(() => load(KEY, defaults));
  const [editing, setEditing] = useState<Auto | null>(null);
  const setList = (l: Auto[]) => {
    setListState(l);
    persist(KEY, l);
  };
  const up = (id: string, p: Partial<Auto>) => setList(list.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const form = useForm(
    { subject: '', body: '', whatsapp: 'false' },
    {
      subject: (v) => (!String(v).trim() ? t('Indiquez un objet') : undefined),
      body: (v) => (String(v).trim().length < 10 ? t('Écrivez un message d’au moins 10 caractères') : undefined),
    },
  );

  const open = (a: Auto) => {
    setEditing(a);
    form.reset({ subject: a.subject, body: a.body, whatsapp: String(a.whatsapp) });
  };
  const save = () => {
    if (!editing || !form.validate()) return;
    up(editing.id, { subject: form.values.subject, body: form.values.body, whatsapp: form.values.whatsapp === 'true' });
    setEditing(null);
    toast(t('Modèle enregistré'));
  };

  return (
    <div>
      <PageHeader title={t('Emails automatiques')} subtitle={t('Modèles des messages envoyés automatiquement à vos participants.')} />
      <p role="note" className="mb-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
        {t('Aujourd’hui, seul l’email de confirmation avec les billets est envoyé, avec un texte fixe. Vos modèles sont enregistrés pour l’envoi automatique des rappels et des mises à jour, qui sera activé prochainement.')}
      </p>
      <ul className="grid gap-4 lg:grid-cols-2">
        {list.map((a) => {
          const I = icons[a.id] ?? icons.confirm;
          return (
            <li key={a.id}>
              <Card className="flex h-full flex-col gap-4">
                <div className="flex items-start gap-3">
                  <IconBadge tone={I.tone}><I.i className="h-[18px] w-[18px]" /></IconBadge>
                  <div className="flex-1">
                    <h2 className="font-bold">{t(a.name)}</h2>
                    <p className="text-sm text-ink-muted">{t(a.trigger)}</p>
                  </div>
                  <Toggle checked={a.on} onChange={(v) => { up(a.id, { on: v }); toast(v ? t('« {name} » activé', { name: t(a.name) }) : t('« {name} » désactivé', { name: t(a.name) }), 'info'); }} label={<span className="sr-only">{t('Activer « {name} »', { name: t(a.name) })}</span>} />
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <Badge tone="brand"><Mail className="h-3 w-3" aria-hidden /> {t('Email')}</Badge>
                  {a.whatsapp && <Badge tone="green"><MessageCircle className="h-3 w-3" aria-hidden /> WhatsApp</Badge>}
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => open(a)}><Pencil className="h-4 w-4" aria-hidden /> {t('Modifier')}</Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? t(editing.name) : ''}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => toast(t('Email de test envoyé à {email}', { email: user?.email ?? '' }), 'info')}>{t('Envoyer un test')}</Button>
            <Button className="flex-1" onClick={save}>{t('Enregistrer')}</Button>
          </>
        }
      >
        <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
          <Field label={t('Objet')} error={form.errors.subject} required><Input {...form.bind('subject')} /></Field>
          <Field label={t('Message')} error={form.errors.body} hint={t('Variables : {prenom} {evenement} {date} {heure} {lieu} {lien}')} required>
            <Textarea className="min-h-[180px]" {...form.bind('body')} />
          </Field>
          <Toggle checked={form.values.whatsapp === 'true'} onChange={(v) => form.set('whatsapp', String(v))} label={t('Envoyer aussi sur WhatsApp')} />
        </form>
      </Modal>
    </div>
  );
}
