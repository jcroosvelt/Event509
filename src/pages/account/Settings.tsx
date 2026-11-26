import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword, deleteAccount, otpChangeConfirm, otpChangeSend, otpChangeVerify, otpEnabled } from '@/services/api';
import { OtpChallenge, otpErrorMessage } from '@/components/otp/OtpChallenge';
import { load, persist, useApp, type Theme } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { languages } from '@/lib/i18n';
import { isEmail, isPhone, useForm } from '@/lib/form';
import { Button, ButtonLink, Card, Field, Input, Modal, PageHeader, Segmented, Select, Toggle } from '@/components/ui';
import { currencyName } from '@/lib/format';
import { countryName } from '@/data/countries';
import { PersonalizeModal } from '@/components/PersonalizeModal';
import { AppLockCard } from '@/components/AppLockCard';
import { DISPLAY_CURRENCIES, type DisplayCurrency, type Lang } from '@/types';

const NOTIF_KEY = 'e509.notifPrefs';
const defaultPrefs = { reminders: true, updates: true, reco: true, marketing: false };

import { BlockedMembers } from '@/components/BlockedMembers';

export default function Settings() {
  const { lang, setLang, currency, setCurrency, theme, setTheme, user, updateUser, logout, toast, t, place, tastes } = useApp();
  const [personalize, setPersonalize] = useState(false);
  useTitle(t('Paramètres'));
  const nav = useNavigate();
  const [prefs, setPrefsState] = useState(() => load(NOTIF_KEY, defaultPrefs));
  const setPref = (k: keyof typeof defaultPrefs, v: boolean) => {
    const next = { ...prefs, [k]: v };
    setPrefsState(next);
    persist(NOTIF_KEY, next);
  };
  const [pwOpen, setPwOpen] = useState(false);
  // Numéro WhatsApp vérifié et service actif : le changement se fait avec un code (le serveur refuse l'ancienne méthode)
  const [byOtp, setByOtp] = useState(false);
  const [otpToken, setOtpToken] = useState('');
  const [otpPw, setOtpPw] = useState({ next: '', confirm: '' });
  const [otpErr, setOtpErr] = useState('');
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

  const saveOtpPassword = async () => {
    if (otpPw.next.length < 8 || !/[A-Za-zÀ-ÿ]/.test(otpPw.next) || !/\d/.test(otpPw.next)) return setOtpErr(t('Au moins 8 caractères, avec une lettre et un chiffre'));
    if (otpPw.next !== otpPw.confirm) return setOtpErr(t('Les deux mots de passe doivent être identiques'));
    setBusy(true);
    setOtpErr('');
    try {
      const r = await otpChangeConfirm(otpToken, otpPw.next);
      // Les autres sessions sont fermées par le serveur ; celle-ci continue avec le nouveau jeton
      // Session par cookie : rien à garder (le serveur ne renvoie un jeton que pour un ancien compte)
      if (r.token) localStorage.setItem('e509.token', r.token);
      setPwOpen(false);
      setOtpToken('');
      setOtpPw({ next: '', confirm: '' });
      toast(t('Mot de passe modifié'));
    } catch (e) {
      setOtpErr(otpErrorMessage(e, t));
    } finally {
      setBusy(false);
    }
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-bold">{t('Position et centres d’intérêt')}</h2>
              <p className="mt-1 text-sm text-ink-soft">{place.city ? `${place.city}, ` : ''}{countryName(place.country, lang)}{tastes.length ? ` · ${t('{n} centre(s) d’intérêt', { n: tastes.length })}` : ''}</p>
            </div>
            <Button variant="outline" onClick={() => setPersonalize(true)}>{t('Personnaliser')}</Button>
          </div>
        </Card>
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
            <Toggle checked={user?.notifyNearby !== false} onChange={(v) => updateUser({ notifyNearby: v })} label={t('Nouveaux événements près de chez moi')} description={t('Une alerte au plus par jour, selon la ville de votre profil (application)')} />
            <Toggle checked={prefs.marketing} onChange={(v) => setPref('marketing', v)} label={t('Offres et promotions')} />
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 font-bold">{t('Sécurité')}</h2>
          <p className="mb-4 text-sm text-ink-soft">{t('Connexion par email, Google ou téléphone.')}</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/compte/securite" variant="soft">{t('Sécurité du compte')}</ButtonLink>
            <Button variant="outline" onClick={async () => { setByOtp(user?.phoneVerified === true && (await otpEnabled())); setOtpToken(''); setOtpErr(''); setPwOpen(true); }}>{t('Changer le mot de passe')}</Button>
            <Button variant="danger" onClick={() => setDelOpen(true)}>{t('Supprimer mon compte')}</Button>
          </div>
        </Card>
      </div>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title={t('Changer le mot de passe')} size="sm" footer={byOtp ? (otpToken ? <Button className="flex-1" onClick={saveOtpPassword} loading={busy}>{t('Enregistrer')}</Button> : undefined) : <Button className="flex-1" onClick={savePassword} loading={busy}>{t('Enregistrer')}</Button>}>
        {byOtp ? (
          otpToken ? (
            <form noValidate onSubmit={(e) => { e.preventDefault(); void saveOtpPassword(); }} className="space-y-4">
              <Field label={t('Nouveau mot de passe')} hint={t('8 caractères minimum, avec une lettre et un chiffre')} required><Input type="password" autoComplete="new-password" value={otpPw.next} onChange={(e) => setOtpPw({ ...otpPw, next: e.target.value })} /></Field>
              <Field label={t('Confirmer le mot de passe')} error={otpErr} required><Input type="password" autoComplete="new-password" value={otpPw.confirm} onChange={(e) => setOtpPw({ ...otpPw, confirm: e.target.value })} /></Field>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-ink-soft">{t('Pour votre sécurité, nous confirmons votre identité avec un code envoyé sur votre WhatsApp.')}</p>
              <OtpChallenge
                send={otpChangeSend}
                verify={async (code) => setOtpToken((await otpChangeVerify(code)).changeToken)}
                onVerified={() => undefined}
              />
            </div>
          )
        ) : (
        <form noValidate onSubmit={(e) => { e.preventDefault(); savePassword(); }} className="space-y-4">
          <Field label={t('Mot de passe actuel')} error={pw.errors.current} required><Input type="password" autoComplete="current-password" {...pw.bind('current')} /></Field>
          <Field label={t('Nouveau mot de passe')} error={pw.errors.next} hint={t('8 caractères minimum')} required><Input type="password" autoComplete="new-password" {...pw.bind('next')} /></Field>
          <Field label={t('Confirmer le mot de passe')} error={pw.errors.confirm} required><Input type="password" autoComplete="new-password" {...pw.bind('confirm')} /></Field>
        </form>
        )}
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
      <BlockedMembers />
      <PersonalizeModal open={personalize} onClose={() => setPersonalize(false)} />
    </div>
  );
}
