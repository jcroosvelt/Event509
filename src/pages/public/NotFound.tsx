import { ButtonLink } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="text-7xl font-extrabold tracking-tight text-ink">4<span className="text-brand">0</span>4</div>
      <h1 className="mt-4 text-xl font-bold">Cette page n’existe pas</h1>
      <p className="mt-2 text-ink-soft">Le lien est peut-être expiré ou l’événement a été retiré.</p>
      <ButtonLink to="/" className="mt-6">Retour à l’accueil</ButtonLink>
    </div>
  );
}
