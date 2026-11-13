import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { unsubscribeMarketing } from '@/services/premium';
import { useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { Loading } from '@/components/ui';

/** Page ouverte depuis le lien de désinscription d'un email de campagne : le jeton prouve que le lien est bien le sien. */
export default function Unsubscribe() {
  const { t } = useApp();
  useTitle(t('Désinscription'));
  const [p] = useSearchParams();
  const [state, setState] = useState<{ org: string } | 'error' | null>(null);
  useEffect(() => {
    unsubscribeMarketing(p.get('o') ?? '', p.get('e') ?? '', p.get('t') ?? '').then((r) => setState({ org: r.organization }), () => setState('error'));
  }, [p]);
  if (!state) return <div className="mx-auto max-w-xl px-4 py-20 text-center"><Loading /></div>;
  const ok = state !== 'error';
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <div aria-hidden className={`mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{ok ? <CheckCircle2 className="h-10 w-10" /> : <TriangleAlert className="h-10 w-10" />}</div>
      <h1 className="text-2xl font-extrabold">{ok ? t('Vous êtes désinscrit') : t('Lien invalide')}</h1>
      <p className="mt-2 text-ink-soft" role="status">{ok ? t('Vous ne recevrez plus les actualités de {name}. Vos billets et vos commandes ne changent pas.', { name: (state as { org: string }).org }) : t('Ce lien de désinscription n’est pas valable. Utilisez le lien présent dans le dernier email reçu.')}</p>
    </div>
  );
}
