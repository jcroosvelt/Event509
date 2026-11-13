import { useEffect, useState } from 'react';
import { Crosshair } from 'lucide-react';
import { categories } from '@/data/mock';
import { COUNTRIES, KNOWN_CITIES, countryName } from '@/data/countries';
import { useApp } from '@/store/app';
import { Button, Chip, Field, Input, Modal, Select } from '@/components/ui';
import { CategoryIcon } from '@/components/events';

/**
 * « Personnaliser » : où je suis (position réelle avec mon autorisation, ou pays et ville choisis à la main) et ce que
 * j'aime. Les événements de ma ville, puis de mon pays, et ceux qui correspondent à mes goûts passent en premier.
 */
export function PersonalizeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { place, setPlace, locate, tastes, setTastes, toast, lang, t } = useApp();
  const [country, setCountry] = useState(place.country);
  const [city, setCity] = useState(place.city);
  const [liked, setLiked] = useState<string[]>(tastes);
  const [locating, setLocating] = useState(false);

  // À l'ouverture : les valeurs en vigueur
  useEffect(() => {
    if (!open) return;
    setCountry(place.country);
    setCity(place.city);
    setLiked(tastes);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const findMe = async () => {
    setLocating(true);
    const found = await locate();
    setLocating(false);
    if (found) {
      toast(t('Position trouvée : les événements près de vous passent en premier'));
      onClose();
    } else toast(t('Position introuvable. Autorisez la localisation ou choisissez votre pays et votre ville.'), 'info');
  };

  const save = () => {
    setPlace({ country, city: city.trim() }, true);
    setTastes(liked);
    toast(t('Préférences enregistrées'));
    onClose();
  };

  const cities = KNOWN_CITIES.filter((k) => k.country === country);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Personnaliser')}
      description={t('Les événements près de vous et ceux que vous aimez passent en premier.')}
      footer={<Button className="flex-1" onClick={save}>{t('Enregistrer')}</Button>}
    >
      <div className="space-y-6">
        <section aria-labelledby="pz-where" className="space-y-3">
          <h3 id="pz-where" className="text-sm font-bold">{t('Où êtes-vous ?')}</h3>
          <Button variant="outline" className="w-full" onClick={findMe} loading={locating}><Crosshair className="h-4 w-4" aria-hidden /> {t('Utiliser ma position')}</Button>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Pays')}>
              <Select value={country} onChange={(e) => { setCountry(e.target.value); setCity(''); }}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{countryName(c, lang)}</option>)}
              </Select>
            </Field>
            <Field label={t('Ville')} hint={t('Facultatif')}>
              <Input list="pz-cities" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
              <datalist id="pz-cities">{cities.map((k) => <option key={k.city} value={k.city} />)}</datalist>
            </Field>
          </div>
        </section>
        <section aria-labelledby="pz-like" className="space-y-3">
          <h3 id="pz-like" className="text-sm font-bold">{t('Ce que vous aimez')}</h3>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Chip key={c.id} active={liked.includes(c.id)} onClick={() => setLiked((l) => (l.includes(c.id) ? l.filter((x) => x !== c.id) : [...l, c.id]))}>
                <CategoryIcon id={c.id} className="h-4 w-4 text-brand-ink" /> {t(c.label)}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-ink-muted">{t('Vos favoris, vos billets et les événements que vous consultez comptent aussi. Ces choix restent sur cet appareil.')}</p>
        </section>
      </div>
    </Modal>
  );
}
