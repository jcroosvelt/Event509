import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { becomeOrganizer, DEMO } from '@/services/api';
import { COUNTRIES, countryName } from '@/data/countries';
import { ApiError } from '@/lib/errors';
import { hasOrganizerAccess } from '@/lib/permissions';
import { Button, Card, Field, Input, PageHeader, Select } from '@/components/ui';

/** Le compte commun devient aussi organisateur : nom de l'organisation et pays, puis l'espace organisateur s'ouvre. */
export default function BecomeOrganizer() {
  const { user, t, lang, place, refresh, updateUser, toast } = useApp();
  useTitle(t('Devenir organisateur'));
  const nav = useNavigate();
  const [orgName, setOrgName] = useState('');
  const [country, setCountry] = useState(place.country || 'HT');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (hasOrganizerAccess(user)) return <Navigate to="/organisateur" replace />;

  const submit = async () => {
    const name = orgName.trim();
    if (name.length < 2) { setError(t('Indiquez le nom de votre organisation')); return; }
    setBusy(true);
    setError('');
    try {
      if (DEMO) updateUser({ role: 'organizer', teamRole: 'admin' });
      else { await becomeOrganizer({ orgName: name, country }); await refresh(); }
      toast(t('Espace organisateur activé'));
      nav('/organisateur', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError && e.status !== 0 ? e.message : t('Réseau indisponible. Vérifiez votre connexion et réessayez.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title={t('Devenir organisateur')} subtitle={t('Créez des événements, vendez des billets et scannez les entrées avec le même compte. C’est gratuit : Event509 prélève une commission uniquement sur les billets payants.')} />
      <Card className="space-y-4 p-6">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-100 text-brand-ink"><Rocket className="h-5 w-5" aria-hidden /></span>
        <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Field label={t('Nom de l’organisation')} hint={t('Affiché sur votre page publique')} error={error} required>
            <Input autoComplete="organization" value={orgName} onChange={(e) => setOrgName(e.target.value)} maxLength={80} />
          </Field>
          <Field label={t('Pays')} required>
            <Select value={country} onChange={(e) => setCountry(e.target.value)}>
              {[...COUNTRIES].sort((a, b) => countryName(a, lang).localeCompare(countryName(b, lang), lang)).map((c) => <option key={c} value={c}>{countryName(c, lang)}</option>)}
            </Select>
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>{t('Activer l’espace organisateur')}</Button>
        </form>
      </Card>
    </div>
  );
}
