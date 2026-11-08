import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';
import { useApp } from '@/store/app';
import { Button, Card, Field, Input, Segmented, Toggle } from '@/components/ui';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-7.9Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

export default function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const { login, toast } = useApp();
  const nav = useNavigate();
  const [via, setVia] = useState<'email' | 'phone'>('email');
  const [otpSent, setOtpSent] = useState(false);
  const [organizer, setOrganizer] = useState(false);
  const [loading, setLoading] = useState(false);
  const signup = mode === 'signup';

  const done = () => {
    setLoading(true);
    setTimeout(() => {
      login(organizer ? 'organizer' : 'participant');
      toast(signup ? 'Compte créé, bienvenue !' : 'Connexion réussie');
      nav(organizer ? '/organisateur' : '/');
    }, 600);
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 pt-8 sm:px-6 lg:grid-cols-2 lg:pt-16">
      <div className="hidden flex-col justify-between rounded-4xl bg-ink p-10 text-white lg:flex">
        <img src="/logo-mark.png" alt="" className="h-14 w-auto self-start" />
        <div>
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">Découvrez des événements.<br />Obtenez votre billet.<br /><span className="text-brand-300">Soyez là.</span></h2>
          <p className="mt-4 text-white/60">Vos billets QR dans l’app, par email et sur WhatsApp. Paiement MonCash, NatCash, carte ou PayPal.</p>
        </div>
      </div>

      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">{signup ? 'Créer un compte' : 'Bon retour !'}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {signup ? 'Déjà inscrit ?' : 'Pas encore de compte ?'}{' '}
          <Link to={signup ? '/connexion' : '/inscription'} className="font-semibold text-brand">{signup ? 'Se connecter' : 'S’inscrire'}</Link>
        </p>

        <Button variant="outline" size="lg" className="mt-6 w-full" onClick={done}>
          <GoogleIcon /> Continuer avec Google
        </Button>

        <div className="my-6 flex items-center gap-3 text-xs text-ink-muted">
          <span className="h-px flex-1 bg-line" /> ou <span className="h-px flex-1 bg-line" />
        </div>

        <Segmented
          className="mb-5 w-full [&>button]:flex-1"
          value={via}
          onChange={(v) => { setVia(v); setOtpSent(false); }}
          options={[
            { value: 'email', label: <span className="flex items-center justify-center gap-2"><Mail className="h-4 w-4" /> Email</span> },
            { value: 'phone', label: <span className="flex items-center justify-center gap-2"><Phone className="h-4 w-4" /> Téléphone</span> },
          ]}
        />

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (via === 'phone' && !otpSent) {
              setOtpSent(true);
              toast('Code envoyé par SMS', 'info');
              return;
            }
            done();
          }}
        >
          {signup && <Field label="Nom complet"><Input required autoComplete="name" placeholder="Marie Joseph" /></Field>}
          {via === 'email' ? (
            <>
              <Field label="Email"><Input type="email" required autoComplete="email" placeholder="vous@exemple.com" /></Field>
              <Field label="Mot de passe" hint={signup ? '8 caractères minimum' : undefined}>
                <Input type="password" required minLength={signup ? 8 : 1} autoComplete={signup ? 'new-password' : 'current-password'} />
              </Field>
              {!signup && <button type="button" className="text-sm font-semibold text-brand" onClick={() => toast('Lien de réinitialisation envoyé', 'info')}>Mot de passe oublié ?</button>}
            </>
          ) : (
            <>
              <Field label="Numéro de téléphone"><Input type="tel" required placeholder="+509 3x xx xx xx" autoComplete="tel" /></Field>
              {otpSent && (
                <Field label="Code reçu par SMS" hint="Démo : n’importe quel code à 6 chiffres">
                  <Input inputMode="numeric" required pattern="\d{6}" maxLength={6} placeholder="••••••" className="text-center text-lg tracking-[0.5em]" />
                </Field>
              )}
            </>
          )}
          {signup && <Toggle checked={organizer} onChange={setOrganizer} label="Je suis organisateur" description="Accédez à la billetterie et au tableau de bord" />}
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {via === 'phone' && !otpSent ? 'Recevoir un code' : signup ? 'Créer mon compte' : 'Se connecter'}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-ink-muted">En continuant, vous acceptez les conditions d’utilisation et la politique de confidentialité d’Event509.</p>
      </Card>
    </div>
  );
}
