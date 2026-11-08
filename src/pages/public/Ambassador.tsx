import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Gift, Link2, MousePointerClick, Share2, Ticket, TrendingUp, Wallet } from 'lucide-react';
import { ambassadors } from '@/data/mock';
import { saveAmbassador } from '@/services/api';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { moneyRaw, num, uid } from '@/lib/format';
import { Button, Card, IconBadge, SparkBars, StatCard } from '@/components/ui';

export default function Ambassador() {
  const { user, toast, lang, t } = useApp();
  useTitle(t('Programme ambassadeurs'));
  const base = (user?.name.split(' ')[0] ?? 'AMI').toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '');
  const existing = ambassadors.find((a) => user && a.name === user.name);
  const [me, setMe] = useState(existing ?? null);
  const [busy, setBusy] = useState(false);
  const link = me ? `${window.location.origin}/?ref=${me.code}` : '';

  const join = async () => {
    setBusy(true);
    const a = { id: uid('am'), name: user!.name, code: `${base}509`, clicks: 0, sales: 0, revenue: 0, commission: 5 };
    await saveAmbassador(a);
    setMe(a);
    setBusy(false);
    toast(t('Bienvenue dans le programme ! Partagez votre lien pour commencer.'));
  };

  const copy = () => navigator.clipboard?.writeText(link).then(() => toast(t('Lien copié')), () => toast(t('Copie impossible : sélectionnez le lien manuellement'), 'error'));

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:pt-12">
      <div className="rounded-4xl bg-brand-100 p-8 sm:p-12">
        <IconBadge size="lg" className="!bg-surface"><Gift className="h-5 w-5" /></IconBadge>
        <h1 className="mt-4 max-w-xl text-3xl font-extrabold tracking-tight sm:text-4xl">{t('Programme ambassadeurs')}</h1>
        <p className="mt-3 max-w-xl text-ink-soft">{t('Partagez vos événements préférés et gagnez jusqu’à 5 % de commission sur chaque billet vendu grâce à votre lien. Versement mensuel sur MonCash, NatCash ou compte bancaire.')}</p>
        {!me &&
          (user ? (
            <Button size="lg" className="mt-6" onClick={join} loading={busy}>{t('Devenir ambassadeur')}</Button>
          ) : (
            <Link to="/connexion?next=/ambassadeurs" className="mt-6 inline-flex h-14 items-center rounded-full bg-brand px-7 font-semibold text-white">{t('Se connecter pour participer')}</Link>
          ))}
      </div>

      {me ? (
        <div className="mt-6 space-y-6">
          <Card>
            <h2 className="mb-2 text-sm font-semibold">{t('Votre lien de parrainage')}</h2>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-canvas px-4 py-3 text-sm"><Link2 className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden /><span className="truncate">{link}</span></div>
              <Button variant="dark" onClick={copy}><Copy className="h-4 w-4" aria-hidden /> {t('Copier')}</Button>
              <a className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white" href={`https://wa.me/?text=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer"><Share2 className="h-4 w-4" aria-hidden /> WhatsApp</a>
            </div>
            <p className="mt-2 text-xs text-ink-muted">{t('Le lien reste actif 30 jours après le clic de vos amis.')}</p>
          </Card>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t('Clics')} value={num(me.clicks, lang)} icon={<MousePointerClick className="h-[18px] w-[18px]" />} />
            <StatCard label={t('Billets vendus')} value={num(me.sales, lang)} icon={<Ticket className="h-[18px] w-[18px]" />} tone="orange" />
            <StatCard label={t('Commission')} value={moneyRaw((me.revenue * me.commission) / 100, 'HTG', lang)} icon={<Wallet className="h-[18px] w-[18px]" />} tone="green" />
            <StatCard label={t('Taux')} value={me.commission} unit="%" icon={<TrendingUp className="h-[18px] w-[18px]" />} tone="violet" />
          </div>
        </div>
      ) : (
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { i: Share2, h: 'Partagez', d: 'Votre lien unique sur WhatsApp, Instagram ou par SMS.' },
            { i: Ticket, h: 'Vos amis achètent', d: 'Chaque billet acheté via votre lien vous est attribué.' },
            { i: Wallet, h: 'Vous êtes payé', d: 'Commission versée chaque mois, sans minimum.' },
          ].map((s) => (
            <li key={s.h}>
              <Card className="h-full">
                <IconBadge><s.i className="h-[18px] w-[18px]" /></IconBadge>
                <h2 className="mt-4 font-bold">{t(s.h)}</h2>
                <p className="mt-1 text-sm text-ink-soft">{t(s.d)}</p>
                <SparkBars values={[3, 5, 4, 7, 6, 9, 8, 11]} className="mt-4" color="bg-brand" />
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
