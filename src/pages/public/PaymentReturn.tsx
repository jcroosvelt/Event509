import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, TriangleAlert } from 'lucide-react';
import { verifyOrderPayment } from '@/services/api';
import { checkBoostPayment, checkPremiumPayment } from '@/services/premium';
import { ApiError } from '@/lib/errors';
import { guestOrderKey, useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { Loading, ButtonLink } from '@/components/ui';

/**
 * Page de retour après un paiement en ligne (MonCash, NatCash, KashPaw, carte). L'adresse de retour configurée
 * chez la plateforme de paiement est « /retour-paiement » : elle ajoute l'identifiant de la commande.
 * Le statut annoncé dans l'adresse n'est jamais cru : le serveur relit l'état du paiement auprès de la plateforme.
 */
export default function PaymentReturn() {
  const { t } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const id = params.get('refference_id') ?? params.get('reference_id') ?? '';
  const [state, setState] = useState<'checking' | 'pending' | 'failed' | 'unknown'>('checking');
  useTitle(t('Paiement'));

  useEffect(() => {
    if (!id) {
      setState('unknown');
      return;
    }
    let stop = false;
    // Abonnement « Organisateur vérifié » : retour vers la page de l'abonnement
    const sub = id.startsWith('sp_');
    const boost = id.startsWith('bo_');
    const key = guestOrderKey(id);
    const done = () => nav(sub ? '/organisateur/abonnement' : boost ? '/organisateur/boosts' : `/commande/${id}${key ? `?k=${encodeURIComponent(key)}` : ''}`, { replace: true });
    let tries = 0;
    const check = async () => {
      try {
        const s = sub ? (await checkPremiumPayment(id)).status : boost ? (await checkBoostPayment(id)).status : await verifyOrderPayment(id);
        if (stop) return;
        if (s === 'paid') return done();
        if (s === 'failed' || (s as string) === 'cancelled') return setState('failed');
      } catch (e) {
        // Commande supprimée : le paiement a échoué ou a expiré
        if (e instanceof ApiError && e.status === 404) return setState('failed');
        /* réseau : on réessaie */
      }
      if (stop) return;
      // Le paiement mobile peut être confirmé quelques secondes plus tard : on revérifie un moment
      if (++tries >= 20) return setState('pending');
      setState('checking');
      setTimeout(check, 3000);
    };
    void check();
    return () => {
      stop = true;
    };
  }, [id, nav]);

  if (state === 'checking') return <div className="mx-auto max-w-xl px-4 py-20 text-center"><Loading /><p className="mt-4 text-ink-soft" role="status">{t('Vérification de votre paiement…')}</p></div>;
  const failed = state === 'failed';
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <div aria-hidden className={`mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full ${failed ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
        {failed ? <TriangleAlert className="h-10 w-10" /> : <Clock className="h-10 w-10" />}
      </div>
      <h1 className="text-2xl font-extrabold">{failed ? t('Le paiement n’a pas abouti') : state === 'pending' ? t('Paiement en cours de confirmation') : t('Commande introuvable')}</h1>
      <p className="mt-2 text-ink-soft">
        {failed
          ? t('Vous n’avez pas été débité et vos places ont été libérées. Vous pouvez réessayer.')
          : state === 'pending'
            ? t('Dès que le paiement est confirmé, vos billets vous sont envoyés par email. Vous pouvez fermer cette page.')
            : t('Ouvrez le lien reçu par email : il contient la clé qui permet de retrouver vos billets.')}
      </p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        {id && state === 'pending' && <ButtonLink to={`/commande/${id}${guestOrderKey(id) ? `?k=${encodeURIComponent(guestOrderKey(id))}` : ''}`} size="lg">{t('Voir ma commande')}</ButtonLink>}
        <ButtonLink to="/explorer" size="lg" variant="outline">{t('Continuer à explorer')}</ButtonLink>
      </div>
      <Link to="/" className="mt-4 inline-block text-sm font-semibold text-brand-ink">{t('Retour à l’accueil')}</Link>
    </div>
  );
}
