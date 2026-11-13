import { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CalendarDays, MapPin, Ticket } from 'lucide-react';
import { getEvent, getOrganizer } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateLong, money, time } from '@/lib/format';
import { Loading } from '@/components/ui';

/**
 * Widget de billetterie, prévu pour être intégré dans le site d'un organisateur vérifié (iframe).
 * Il montre l'événement et les billets ; l'achat s'ouvre sur Event509, dans un nouvel onglet : le paiement et les
 * données de l'acheteur ne passent jamais par le site qui intègre le widget.
 */
export default function Widget() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const { t, lang } = useApp();
  const root = useRef<HTMLDivElement>(null);
  const { data: ev, loading } = useAsync(() => getEvent(slug), [slug]);
  useEffect(() => {
    if (params.get('theme') === 'dark') document.documentElement.classList.add('dark');
  }, [params]);
  // Annonce la hauteur au site hôte pour que l'iframe s'ajuste
  useEffect(() => {
    const send = () => root.current && window.parent?.postMessage({ type: 'event509:height', slug, height: Math.ceil(root.current.getBoundingClientRect().height) + 16 }, '*');
    send();
    const ro = new ResizeObserver(send);
    if (root.current) ro.observe(root.current);
    return () => ro.disconnect();
  }, [slug, ev]);

  if (loading) return <div className="p-6"><Loading /></div>;
  const org = ev ? getOrganizer(ev.organizerId) : null;
  // Le widget est un avantage : il ne s'affiche que pour un organisateur actuellement vérifié avec l'avantage API
  if (!ev || ev.status !== 'published' || !org?.perks?.includes('api'))
    return <div className="grid min-h-[200px] place-items-center p-6 text-center text-sm text-ink-soft">{t('Ce widget de billetterie n’est pas disponible.')}</div>;
  const url = `${window.location.origin}/e/${ev.slug}/achat`;

  return (
    <div ref={root} className="bg-canvas p-3 text-ink">
      <article className="overflow-hidden rounded-3xl bg-surface shadow-card">
        <div className="h-24" style={{ background: /^(https?:|\/)/.test(ev.cover) ? `center/cover url(${ev.cover})` : ev.cover }} aria-hidden />
        <div className="space-y-3 p-4">
          <h1 className="text-lg font-extrabold leading-tight">{ev.title}</h1>
          <p className="flex items-center gap-2 text-sm text-ink-soft"><CalendarDays className="h-4 w-4 shrink-0" aria-hidden /> <span className="first-letter:uppercase">{dateLong(ev.start, lang)}</span> · {time(ev.start, lang)}</p>
          <p className="flex items-center gap-2 text-sm text-ink-soft"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> {ev.venue ? `${ev.venue.name}, ${ev.venue.city}` : t('En ligne')}</p>
          <ul className="space-y-1.5">
            {ev.tickets.map((tk) => {
              const left = tk.quota - tk.sold;
              return (
                <li key={tk.id} className="flex items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><Ticket className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden /><span className="truncate font-semibold">{tk.name}</span></span>
                  <span className="shrink-0 text-right"><b>{tk.price === 0 ? t('Gratuit') : money(tk.price, ev.currency, lang)}</b><span className="block text-xs text-ink-muted">{left > 0 ? t('{n} restants', { n: left }) : t('Complet')}</span></span>
                </li>
              );
            })}
          </ul>
          <a href={url} target="_blank" rel="noopener" className="flex h-12 w-full items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white">
            {t('Acheter mes billets')}<span className="sr-only"> ({t('nouvel onglet')})</span>
          </a>
          <p className="text-center text-xs text-ink-muted">{t('Paiement sécurisé sur Event509')}</p>
        </div>
      </article>
    </div>
  );
}
