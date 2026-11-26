import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useApp } from '@/store/app';
import { socialAvailable, startConversation } from '@/services/social';
import { Button, Field, Modal, Textarea } from '@/components/ui';

/** « Écrire à l'organisateur » : message privé (réponse dans la messagerie du compte). Réservé aux comptes connectés. */
export function MessageOrganizer({ organizerId, organizerName, eventId, variant = 'outline', size }: { organizerId: string; organizerName: string; eventId?: string; variant?: 'outline' | 'soft' | 'primary'; size?: 'sm' }) {
  const { t, user, toast } = useApp();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (!socialAvailable || user?.organizerId === organizerId) return null;

  const send = async () => {
    setBusy(true);
    try {
      await startConversation(organizerId, text, eventId);
      setSent(true);
      setText('');
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Le message n’a pas pu être envoyé. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  if (!user)
    return <Link to={`/connexion?next=${encodeURIComponent(loc.pathname)}`}><Button variant={variant} size={size}><Mail className="h-4 w-4" aria-hidden /> {t('Écrire')}</Button></Link>;
  return (
    <>
      <Button variant={variant} size={size} onClick={() => { setSent(false); setOpen(true); }}><Mail className="h-4 w-4" aria-hidden /> {t('Écrire')}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('Écrire à {name}', { name: organizerName })} footer={sent ? <Button onClick={() => setOpen(false)}>{t('Fermer')}</Button> : <><Button variant="ghost" onClick={() => setOpen(false)}>{t('Annuler')}</Button><Button loading={busy} disabled={!text.trim()} onClick={() => void send()}>{t('Envoyer')}</Button></>}>
        {sent ? (
          <p className="text-sm text-ink-soft">{t('Message envoyé. La réponse arrivera dans votre messagerie.')} <Link to="/compte/messages" className="font-semibold text-brand-ink" onClick={() => setOpen(false)}>{t('Ouvrir ma messagerie')}</Link></p>
        ) : (
          <Field label={t('Votre message')} hint={t('L’organisateur ne voit que votre prénom et l’initiale de votre nom, jamais votre email ni votre téléphone.')}>
            <Textarea rows={5} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
      </Modal>
    </>
  );
}
