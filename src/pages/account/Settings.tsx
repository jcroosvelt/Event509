import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword, deleteAccount } from '@/services/api';
import { load, persist, useApp, type Theme } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { languages } from '@/lib/i18n';
import { isEmail, isPhone, useForm } from '@/lib/form';
import { Button, Card, Field, Input, Modal, PageHeader, Segmented, Select, Toggle } from '@/components/ui';
import { currencyName } from '@/lib/format';
import { AppLockCard } from '@/components/AppLockCard';
import { DISPLAY_CURRENCIES, type DisplayCurrency, type Lang } from '@/types';

const NOTIF_KEY = 'e509.notifPrefs';
const defaultPrefs = { reminders: true, updates: true, reco: true, sms: false, whatsapp: true, marketing: false };

export default function Settings() {
  const { lang, setLang, currency, setCurrency, theme, setTheme, user, updateUser, logout, toast, t } = useApp();
  useTitle(t('Paramètres'));
  const nav = useNavigate();
  const [prefs, setPrefsState] = useState(() => load(NOTIF_KEY, defaultPrefs));
  const setPref = (k: keyof typeof defaultPrefs, v: boolean) => {
    const next = { ...prefs, [k]: v };
    setPrefsState(next);
    persist(NOTIF_KEY, next);
  };
  const [pwOpen, setPwOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const profile = useForm(
    { name: user?.name ?? '', email: user?.email ?? '', phone: user?.phone ?? '', city: user?.city ?? '' },
    {
      name: (v) => (!String(v).trim() ? t('Indiquez votre nom') : undefined),
      email: (v) => (!isEmail(v) ? t('Saisissez une adresse comme nom@domaine.com') : undefined),
      phone: (v) => (v && !isPhone(v) ? t('Saisissez un numéro comme +509 3712 3456') : undefined),
    },
  );
  const pw = useForm(
    { current: '', next: '', confirm: '' },
    {
      current: (v) => (!v ? t('Saisissez votre mot de passe actuel') : undefined),
      next: (v) => (String(v).length < 8 ? t('Choisissez au moins 8 caractères') : undefined),
      confirm: (v, all) => (v !== all.next ? t('Les deux mots de passe doivent être identiques') : undefined),
    },
  );
  const del = useForm({ confirm: '' }, { confirm: (v) => (String(v).trim().toUpperCase() !== t('SUPPRIMER') ? t('Tapez {word} pour confirmer', { word: t('SUPPRIMER') }) : undefined) });

  const saveProfile = () => {
    if (!profile.validate()) return;
    updateUser(profile.values);
    toast(t('Profil mis à jour'));
  };

  const savePassword = async () => {
    if (!pw.validate()) return;
    setBusy(true);
    try {
      await changePassword(pw.values.current, pw.values.next);
      setPwOpen(false);
      pw.reset();
      toast(t('Mot de passe modifié'));
    } catch {
      pw.setErrors({ current: t('Ce mot de passe ne correspond pas à votre compte') });
    } finally {
      setBusy(false);
    }
  };

  const removeAccount = async () => {
    if (!del.validate()) return;
    setBusy(true);
    await deleteAccount();
    setBusy(false);
    logout();
    toast(t('Votre compte a été supprimé. Vos billets à venir restent valides jusqu’à l’événement.'), 'info');
    nav('/', { replace: true });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 lg:pt-10">
      <PageHeader title={t('Paramètres')} />
      <div className="space-y-4">
        <AppLockCard />
        <Card>
          <h2 className="mb-4 font-bold">{t('Préférences')}</h2>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span id="l-lang" className="text-sm font-semibold">{t('Langue')}</span>
              <Segmented label={t('Langue')} value={lang} onChange={(v) => setLang(v as Lang)} options={languages.map((l) => ({ value: l.id, label: l.label }))} size="sm" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold">{t('Devise')}</span>
              <Select aria-label={t('Devise')} value={currency} onChange={(e) => setCurrency(e.target.value as DisplayCurrency)} className="!h-10 w-auto min-w-[11rem] !py-0 text-sm font-semibold">
                {DISPLAY_CURRENCIES.map((c) => <option key={c} value={c}>{c} — {currencyName(c, lang)}</option>)}
              </Select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold">{t('Thème')}</span>
              <Segmented label={t('Thème')} value={theme} onChange={(v) => setTheme(v as Theme)} options={[{ value: 'system', label: t('Système') }, { value: 'light', label: t('Clair') }, { value: 'dark', label: t('Sombre') }]} size="sm" />
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-bold">{t('Profil')}</h2>
          <form noValidate onSubmit={(e) => { e.preventDefault(); saveProfile(); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Nom')} error={profile.errors.name} required><Input autoComplete="name" {...profile.bind('name')} /></Field>
              <Field label={t('Email')} error={profile.errors.email} required><Input type="email" autoComplete="email" {...profile.bind('email')} /></Field>
              <Field label={t('Téléphone')} error={profile.errors.phone}><Input type="tel" autoComplete="tel" {...profile.bind('phone')} /></Field>
              <Field label={t('Ville')}><Input autoComplete="address-level2" {...profile.bind('city')} /></Field>
            </div>
            <Button type="submit" className="mt-4">{t('Enregistrer')}</Button>
          </form>
        </Card>

        <Card id="notifications">
          <h2 className="mb-4 font-bold">{t('Notifications')}</h2>
          <div className="space-y-4">
            <Toggle checked={prefs.reminders} onChange={(v) => setPref('reminders', v)} label={t('Rappels d’événements')} description={t('24 h et 1 h avant le début')} />
            <Toggle checked={prefs.updates} onChange={(v) => setPref('updates', v)} label={t('Mises à jour des organisateurs')} description={t('Changement d’horaire, de lieu, annulation')} />
            <Toggle checked={prefs.reco} onChange={(v) => setPref('reco', v)} label={t('Événements recommandés')} />
            <Toggle checked={prefs.whatsapp} onChange={(v) => setPref('whatsapp', v)} label={t('Recevoir sur WhatsApp')} />
            <Toggle checked={prefs.sms} onChange={(v) => setPref('sms', v)} label={t('Recevoir par SMS')} />
            <Toggle checked={prefs.marketing} onChange={(v) => setPref('marketing', v)} label={t('Offres et promotions')} />
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 font-bold">{t('Sécurité')}</h2>
          <p className="mb-4 text-sm text-ink-soft">{t('Connexion par email, Google ou téléphone.')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPwOpen(true)}>{t('Changer le mot de passe')}</Button>
            <Button variant="danger" onClick={() => setDelOpen(true)}>{t('Supprimer mon compte')}</Button>
          </div>
        </Card>
      </div>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title={t('Changer le mot de passe')} size="sm" footer={<Button className="flex-1" onClick={savePassword} loading={busy}>{t('Enregistrer')}</Button>}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); savePassword(); }} className="space-y-4">
          <Field label={t('Mot de passe actuel')} error={pw.errors.current} required><Input type="password" autoComplete="current-password" {...pw.bind('current')} /></Field>
          <Field label={t('Nouveau mot de passe')} error={pw.errors.next} hint={t('8 caractères minimum')} required><Input type="password" autoComplete="new-password" {...pw.bind('next')} /></Field>
          <Field label={t('Confirmer le mot de passe')} error={pw.errors.confirm} required><Input type="password" autoComplete="new-password" {...pw.bind('confirm')} /></Field>
        </form>
      </Modal>

      <Modal
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title={t('Supprimer mon compte')}
        description={t('Votre profil, vos favoris et votre historique seront effacés. Vos billets à venir restent valides. Cette action est définitive.')}
        size="sm"
        footer={<Button variant="danger" className="flex-1" onClick={removeAccount} loading={busy}>{t('Supprimer définitivement')}</Button>}
      >
        <form noValidate onSubmit={(e) => { e.preventDefault(); removeAccount(); }}>
          <Field label={t('Tapez {word} pour confirmer', { word: t('SUPPRIMER') })} error={del.errors.confirm} required>
            <Input autoComplete="off" {...del.bind('confirm')} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
