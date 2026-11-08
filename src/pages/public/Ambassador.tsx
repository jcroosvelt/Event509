import { useState } from 'react';
import { Copy, Gift, Link2, MousePointerClick, Share2, Ticket, TrendingUp, Wallet } from 'lucide-react';
import { useApp } from '@/store/app';
import { moneyRaw } from '@/lib/format';
import { Button, Card, IconBadge, SparkBars, StatCard } from '@/components/ui';

export default function Ambassador() {
  const { user, toast, lang } = useApp();
  const [joined, setJoined] = useState(false);
  const code = (user?.name.split(' ')[0] ?? 'AMI').toUpperCase() + '509';
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/?ref=${code}`;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:pt-12">
      <div className="rounded-4xl bg-brand-100 p-8 sm:p-12">
        <IconBadge size="lg" className="bg-white"><Gift className="h-5 w-5" /></IconBadge>
        <h1 className="mt-4 max-w-xl text-3xl font-extrabold tracking-tight sm:text-4xl">Programme ambassadeurs</h1>
        <p className="mt-3 max-w-xl text-ink-soft">Partagez vos événements préférés et gagnez jusqu’à 5 % de commission sur chaque billet vendu grâce à votre lien. Versement mensuel sur MonCash, NatCash ou compte bancaire.</p>
        {!joined && <Button size="lg" className="mt-6" onClick={() => { setJoined(true); toast('Bienvenue dans le programme !'); }}>Devenir ambassadeur</Button>}
      </div>

      {joined ? (
        <div className="mt-6 space-y-6">
          <Card>
            <div className="mb-2 text-sm font-semibold">Votre lien de parrainage</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex flex-1 items-center gap-2 rounded-2xl bg-canvas px-4 py-3 text-sm"><Link2 className="h-4 w-4 text-ink-muted" /><span className="truncate">{link}</span></div>
              <Button variant="dark" onClick={() => { navigator.clipboard?.writeText(link); toast('Lien copié'); }}><Copy className="h-4 w-4" /> Copier</Button>
              <a className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white" href={`https://wa.me/?text=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer"><Share2 className="h-4 w-4" /> WhatsApp</a>
            </div>
            <p className="mt-2 text-xs text-ink-muted">Code promo associé : <b className="text-ink">{code}</b></p>
          </Card>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Clics" value="0" icon={<MousePointerClick className="h-[18px] w-[18px]" />} />
            <StatCard label="Billets vendus" value="0" icon={<Ticket className="h-[18px] w-[18px]" />} tone="orange" />
            <StatCard label="Commission" value={moneyRaw(0, 'HTG', lang)} icon={<Wallet className="h-[18px] w-[18px]" />} tone="green" />
            <StatCard label="Taux" value="5" unit="%" icon={<TrendingUp className="h-[18px] w-[18px]" />} tone="violet" />
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { i: Share2, t: 'Partagez', d: 'Votre lien unique sur WhatsApp, Instagram ou par SMS.' },
            { i: Ticket, t: 'Vos amis achètent', d: 'Chaque billet acheté via votre lien vous est attribué.' },
            { i: Wallet, t: 'Vous êtes payé', d: 'Commission versée chaque mois, sans minimum.' },
          ].map((s) => (
            <Card key={s.t}>
              <IconBadge><s.i className="h-[18px] w-[18px]" /></IconBadge>
              <h3 className="mt-4 font-bold">{s.t}</h3>
              <p className="mt-1 text-sm text-ink-soft">{s.d}</p>
              <SparkBars values={[3, 5, 4, 7, 6, 9, 8, 11]} className="mt-4" color="bg-brand" />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
