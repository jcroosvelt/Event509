import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useApp } from '@/store/app';
import { googleUrl, reauthPasskeyOptions, reauthPasskeyVerify, reauthWithCode } from '@/services/api';
import { getPasskeyAssertion, passkeyCancelled, passkeysSupported } from '@/lib/webauthn';
import { Button, Field, Input, Modal } from '@/components/ui';
import { inApp } from '@/lib/appBridge';

/** Confirmation d'identité récente : Google, passkey ou code de récupération. */
export default function ReauthModal({ onClose, onDone, next = '/compte/securite' }: { onClose: () => void; onDone: () => void; next?: string }) {
  const { t, toast } = useApp();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const withPasskey = async () => {
    setBusy(true);
    try {
      const o = await reauthPasskeyOptions();
      await reauthPasskeyVerify(o.challengeId, await getPasskeyAssertion(o.options));
      onDone();
    } catch (e) {
      if (!passkeyCancelled(e)) toast(t('Vérification impossible. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const withCode = async () => {
    setBusy(true);
    try {
      await reauthWithCode(code);
      onDone();
    } catch {
      toast(t('Code incorrect ou déjà utilisé.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={t('Confirmez votre identité')} description={t('Cette opération est sensible : prouvez que c’est bien vous.')} size="sm">
      <div className="space-y-4">
        {!inApp() && <a href={googleUrl('reauth', next)} className="flex h-11 items-center justify-center rounded-full border border-line text-sm font-bold hover:bg-canvas">{t('Confirmer avec Google')}</a>}
        {passkeysSupported() && <Button variant="outline" className="w-full" onClick={withPasskey} loading={busy}><KeyRound className="h-4 w-4" aria-hidden /> {t('Confirmer avec une passkey')}</Button>}
        <form onSubmit={(e) => { e.preventDefault(); void withCode(); }} className="space-y-2">
          <Field label={t('Ou un code de récupération')}><Input value={code} autoComplete="off" placeholder="XXXX-XXXX-XXXX" onChange={(e) => setCode(e.target.value)} /></Field>
          <Button type="submit" variant="soft" className="w-full" loading={busy} disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 12}>{t('Utiliser ce code')}</Button>
        </form>
      </div>
    </Modal>
  );
}
