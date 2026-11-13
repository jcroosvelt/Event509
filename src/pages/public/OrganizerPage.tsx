import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useParams } from 'react-router-dom';
import { CalendarX, Check, Facebook, Globe, Instagram, Link2, Linkedin, MapPin, Share2, Youtube } from 'lucide-react';
import { getOrganizerPage } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateShort, num } from '@/lib/format';
import { brandVars } from '@/lib/brandColor';
import { Avatar, Button, Card, EmptyState, Loading, SectionHeader } from '@/components/ui';
import { EventCard } from '@/components/events';
import NotFound from './NotFound';

export default function OrganizerPage() {
  const { slug = '' } = useParams();
  const { t, lang, follows, toggleFollow, toast, theme } = useApp();
  const { data, loading } = useAsync(() => getOrganizerPage(slug), [slug]);
  useTitle(data?.org.name);

  if (loading) return <Loading />;
  if (!data) return <NotFound />;
  const { org, events } = data;
  const following = follows.includes(org.id);
  const now = new Date();
  const upcoming = events.filter((e) => new Date(e.end) >= now);
  const past = events.filter((e) => new Date(e.end) < now).sort((a, b) => b.end.localeCompare(a.end));
  // Page professionnelle : couleur de marque, bannière et réseaux ne s'affichent que pour un organisateur actuellement vérifié
  const pro = !!org.verified;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const vars = pro ? brandVars(org.brandColor, dark) : undefined;
  const bannerImg = pro && /^(https?:|\/)/.test(org.cover ?? '');
  const socials: { k: string; label: string; icon: typeof Globe; url: string }[] = pro
    ? [
        { k: 'facebook', label: 'Facebook', icon: Facebook, url: org.socials?.facebook ?? '' }, { k: 'youtube', label: 'YouTube', icon: Youtube, url: org.socials?.youtube ?? '' },
        { k: 'linkedin', label: 'LinkedIn', icon: Linkedin, url: org.socials?.linkedin ?? '' }, { k: 'tiktok', label: 'TikTok', icon: Link2, url: org.socials?.tiktok ?? '' },
        { k: 'x', label: 'X', icon: Link2, url: org.socials?.x ?? '' },
      ].filter((x) => x.url)
    : [];
  const share = () => {
    const url = window.location.href;
    if (typeof navigator.share === 'function') navigator.share({ title: org.name, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => toast(t('Lien copié')));
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:pt-8" style={vars}>
      {/* Le dégradé reste en dessous : si l'image de la bannière ne charge pas, il apparaît à sa place */}
      <div
        className="-mx-4 h-40 overflow-hidden sm:mx-0 sm:h-56 sm:rounded-4xl"
        style={{ background: vars || bannerImg ? 'linear-gradient(135deg, rgb(var(--brand)) 0%, rgb(var(--brand-dark)) 100%)' : org.cover }}
        aria-hidden
      >
        {bannerImg && <img src={org.cover} alt="" className="h-full w-full object-cover" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      </div>
      <Card className="relative -mt-12 mx-auto max-w-4xl sm:-mt-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Avatar name={org.avatar} src={org.logo} size={88} className="-mt-14 ring-4 ring-surface" />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
              {org.name} {org.verified && <VerifiedBadge size={26} />}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden /> {org.city}</span>
              <span>{t('{n} abonnés', { n: num(org.followers + (following ? 1 : 0), lang) })}</span>
              <span>{t('{n} événements', { n: org.eventsCount })}</span>
              {pro && org.verifiedSince && <span>{t('Certifié depuis le {date}', { date: dateShort(org.verifiedSince, lang) })}</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={share} aria-label={t('Partager')}><Share2 className="h-4 w-4" aria-hidden /></Button>
            <Button
              variant={following ? 'soft' : 'primary'}
              aria-pressed={following}
              onClick={() => {
                toggleFollow(org.id);
                toast(following ? t('Vous ne suivez plus {name}', { name: org.name }) : t('Vous suivez {name}. Vous serez prévenu de ses nouveaux événements.', { name: org.name }));
              }}
            >
              {following && <Check className="h-4 w-4" aria-hidden />} {following ? t('Abonné') : t('Suivre')}
            </Button>
          </div>
        </div>
        {org.bio && <p className="mt-4 text-ink-soft">{org.bio}</p>}
        {(org.website || org.instagram || socials.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
            {org.website && <a href={org.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-brand-ink"><Globe className="h-4 w-4" aria-hidden /> {org.website.replace(/^https?:\/\//, '')}</a>}
            {org.instagram && <span className="flex items-center gap-1.5 text-ink-soft"><Instagram className="h-4 w-4" aria-hidden /> {org.instagram}</span>}
            {socials.map((x) => <a key={x.k} href={x.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-brand-ink"><x.icon className="h-4 w-4" aria-hidden /> {x.label}<span className="sr-only"> ({t('nouvel onglet')})</span></a>)}
          </div>
        )}
      </Card>

      <section aria-labelledby="h-up" className="mt-10">
        <SectionHeader id="h-up" title={t('Prochains événements')} />
        {upcoming.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{upcoming.map((e) => <EventCard key={e.id} event={e} />)}</div>
        ) : (
          <EmptyState icon={<CalendarX className="h-5 w-5" />} title={t('Aucun événement à venir')} body={t('Suivez cet organisateur pour être prévenu de ses prochaines dates.')} />
        )}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="h-past" className="mt-10 pb-6">
          <SectionHeader id="h-past" title={t('Événements précédents')} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{past.slice(0, 12).map((e) => <EventCard key={e.id} event={e} />)}</div>
        </section>
      )}
    </div>
  );
}
