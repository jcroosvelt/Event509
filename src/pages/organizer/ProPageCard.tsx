import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ImagePlus, Lock, Palette } from 'lucide-react';
import { organizers } from '@/data/mock';
import { DEMO, saveOrganizer, uploadFile } from '@/services/api';
import { getPremium } from '@/services/premium';
import { shrinkImage } from '@/lib/image';
import { HEX, brandVars, contrastWithWhite, readableBrand } from '@/lib/brandColor';
import { useApp } from '@/store/app';
import { useAsync } from '@/lib/hooks';
import { orgOf } from '@/lib/permissions';
import { Button, Card, Field, IconBadge, Input } from '@/components/ui';
import { ApiError } from '@/lib/errors';
import type { Organizer } from '@/types';

const DEFAULT_COVER = 'linear-gradient(135deg, #1F5EFF 0%, #0B1533 100%)';
const SOCIALS = [['facebook', 'Facebook'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn'], ['tiktok', 'TikTok'], ['x', 'X']] as const;

/**
 * Réglages de la page professionnelle (avantage des organisateurs vérifiés) : adresse personnalisée, bannière,
 * couleur de marque et réseaux sociaux. Le serveur refuse ces champs à un organisateur non vérifié.
 */
export function ProPageCard() {
  const { t, toast, user, theme } = useApp();
  const prem = useAsync(() => (DEMO ? Promise.resolve(null) : getPremium()), []);
  const org = organizers.find((o) => o.id === orgOf(user));
  if (DEMO || !org || !prem.data) return null;
  if (!prem.data.benefits.includes('page'))
    return (
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <IconBadge tone="violet"><Lock className="h-[18px] w-[18px]" /></IconBadge>
          <div className="min-w-0 flex-1"><h2 className="font-bold">{t('Page professionnelle')}</h2><p className="text-sm text-ink-muted">{t('Adresse personnalisée, bannière, couleurs de marque et réseaux : réservé aux organisateurs vérifiés.')}</p></div>
          <Link to="/organisateur-verifie" className="text-sm font-semibold text-brand-ink">{t('Découvrir le programme')}</Link>
        </div>
      </Card>
    );
  return <Form org={org} theme={theme} toast={toast} t={t} />;
}

function Form({ org, theme, toast, t }: { org: Organizer; theme: string; toast: (m: string, k?: 'error' | 'info') => void; t: (s: string, v?: Record<string, string | number>) => string }) {
  const [slug, setSlug] = useState(org.slug);
  const [color, setColor] = useState(org.brandColor ?? '');
  const [socials, setSocials] = useState<NonNullable<Organizer['socials']>>(org.socials ?? {});
  const [cover, setCover] = useState(org.cover ?? DEFAULT_COVER);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isImage = /^(https?:|\/)/.test(cover);
  const dark = theme === 'dark';
  const colorOk = !color || readableBrand(color);

  const onBanner = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast(t('Choisissez une image JPG, PNG ou WebP'), 'error');
    setUpload(true);
    try {
      const { url } = await uploadFile('event_cover', await shrinkImage(f, { maxSide: 1800, type: 'image/jpeg', quality: 0.85 }), f.name);
      await saveOrganizer(org.id, { cover: url });
      setCover(url);
      toast(t('Bannière enregistrée'));
    } catch (e) {
      toast(e instanceof ApiError && e.status === 403 ? t('La page professionnelle est réservée aux organisateurs vérifiés') : t('L’image n’a pas pu être envoyée. Vérifiez votre connexion et réessayez.'), 'error');
    } finally {
      setUpload(false);
    }
  };
  const removeBanner = async () => {
    try {
      await saveOrganizer(org.id, { cover: DEFAULT_COVER });
      setCover(DEFAULT_COVER);
      toast(t('Bannière retirée'));
    } catch {
      toast(t('Action impossible. Réessayez.'), 'error');
    }
  };
  const save = async () => {
    if (!colorOk) return toast(t('Choisissez une couleur plus foncée : le texte blanc des boutons doit rester lisible'), 'error');
    setBusy(true);
    try {
      await saveOrganizer(org.id, { slug, brandColor: color, socials });
      toast(t('Page professionnelle enregistrée'));
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : t('Enregistrement impossible'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const preview = brandVars(color, dark);

  return (
    <Card>
      <div className="mb-4 flex items-center gap-3">
        <IconBadge tone="brand"><Palette className="h-[18px] w-[18px]" /></IconBadge>
        <div className="min-w-0 flex-1"><h2 className="font-bold">{t('Page professionnelle')}</h2><p className="text-sm text-ink-muted">{t('Votre page publique : adresse, bannière, couleur de marque et réseaux.')}</p></div>
        <Link to={`/organisateur/${slug || org.slug}`} className="flex items-center gap-1 text-sm font-semibold text-brand-ink">{t('Voir')} <ExternalLink className="h-3.5 w-3.5" aria-hidden /></Link>
      </div>

      <div className="space-y-4">
        <Field label={t('Adresse de votre page')} hint={`${window.location.host}/organisateur/${slug || '…'}`}>
          <Input value={slug} maxLength={40} autoCapitalize="none" spellCheck={false} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
        </Field>

        <div>
          <span className="mb-1.5 block text-sm font-semibold">{t('Bannière')}</span>
          <div className="h-28 overflow-hidden rounded-2xl ring-1 ring-line" style={isImage ? undefined : { background: preview ? 'linear-gradient(135deg, rgb(var(--brand)) 0%, rgb(var(--brand-dark)) 100%)' : cover }}>
            {isImage && <img src={cover} alt="" className="h-full w-full object-cover" />}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void onBanner(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" variant="outline" loading={upload} onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" aria-hidden /> {isImage ? t('Changer la bannière') : t('Ajouter une bannière')}</Button>
            {isImage && <Button type="button" size="sm" variant="ghost" onClick={removeBanner}>{t('Retirer')}</Button>}
          </div>
        </div>

        <div style={preview}>
          <Field label={t('Couleur de marque')} error={!colorOk ? t('Trop claire : le texte blanc des boutons ne serait pas lisible') : undefined} hint={color && HEX.test(color) ? t('Contraste avec le texte blanc : {n} : 1', { n: contrastWithWhite(color).toFixed(1) }) : t('Appliquée à votre page publique')}>
            <div className="flex gap-2">
              <input type="color" aria-label={t('Choisir une couleur')} value={HEX.test(color) ? color : '#1F5EFF'} onChange={(e) => setColor(e.target.value)} className="h-11 w-14 cursor-pointer rounded-xl border border-line bg-surface p-1" />
              <Input value={color} placeholder="#1F5EFF" maxLength={7} onChange={(e) => setColor(e.target.value.trim())} />
              {color && <Button type="button" variant="ghost" onClick={() => setColor('')}>{t('Effacer')}</Button>}
            </div>
          </Field>
          {preview && <button type="button" tabIndex={-1} aria-hidden className="mt-3 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white">{t('Aperçu du bouton')}</button>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIALS.map(([k, label]) => (
            <Field key={k} label={label} hint={k === 'facebook' ? t('Adresse complète, en https://') : undefined}>
              <Input type="url" inputMode="url" placeholder="https://" value={socials[k] ?? ''} onChange={(e) => setSocials({ ...socials, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
        <Button type="button" loading={busy} onClick={save}>{t('Enregistrer')}</Button>
      </div>
    </Card>
  );
}
