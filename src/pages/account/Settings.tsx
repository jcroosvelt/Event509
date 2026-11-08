import { useState } from 'react';
import { useApp } from '@/store/app';
import { languages } from '@/lib/i18n';
import { Button, Card, Field, Input, PageHeader, Segmented, Toggle } from '@/components/ui';
import type { Currency, Lang } from '@/types';

export default function Settings() {
  const { lang, setLang, currency, setCurrency, user, updateUser, toast, t } = useApp();
  const [n, setN] = useState({ reminders: true, updates: true, reco: true, sms: false, whatsapp: true, marketing: false });
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 lg:pt-10">
      <PageHeader title={t('nav.settings')} />
      <div className="space-y-4">
        <Card>
          <h2 className="mb-4 font-bold">Préférences</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold">{t('settings.language')}</span>
              <Segmented value={lang} onChange={(v) => setLang(v as Lang)} options={languages.map((l) => ({ value: l.id, label: l.label }))} size="sm" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold">{t('settings.currency')}</span>
              <Segmented value={currency} onChange={(v) => setCurrency(v as Currency)} options={[{ value: 'HTG', label: 'HTG — Gourde' }, { value: 'USD', label: 'USD — Dollar' }]} size="sm" />
            </div>
          </div>
        </Card>

        {user && (
          <Card>
            <h2 className="mb-4 font-bold">Profil</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Téléphone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            </div>
            <Button className="mt-4" onClick={() => { updateUser({ name, phone }); toast('Profil mis à jour'); }}>{t('common.save')}</Button>
          </Card>
        )}

        <Card id="notifications">
          <h2 className="mb-4 font-bold">Notifications</h2>
          <div className="space-y-4">
            <Toggle checked={n.reminders} onChange={(v) => setN({ ...n, reminders: v })} label="Rappels d’événements" description="24 h et 1 h avant le début" />
            <Toggle checked={n.updates} onChange={(v) => setN({ ...n, updates: v })} label="Mises à jour des organisateurs" description="Changement d’horaire, de lieu, annulation" />
            <Toggle checked={n.reco} onChange={(v) => setN({ ...n, reco: v })} label="Événements recommandés" />
            <Toggle checked={n.whatsapp} onChange={(v) => setN({ ...n, whatsapp: v })} label="Recevoir sur WhatsApp" />
            <Toggle checked={n.sms} onChange={(v) => setN({ ...n, sms: v })} label="Recevoir par SMS" />
            <Toggle checked={n.marketing} onChange={(v) => setN({ ...n, marketing: v })} label="Offres et promotions" />
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 font-bold">Sécurité</h2>
          <p className="mb-4 text-sm text-ink-soft">Connexion par email, Google ou téléphone.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => toast('Email de modification envoyé', 'info')}>Changer le mot de passe</Button>
            <Button variant="danger" onClick={() => toast('Demande de suppression enregistrée', 'info')}>Supprimer mon compte</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
