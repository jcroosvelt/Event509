import { useAppLock } from '@/lib/appBridge';
import { useApp } from '@/store/app';
import { Card, Toggle } from '@/components/ui';

/** Réglage du verrouillage par empreinte : visible seulement dans l'application Android. */
export function AppLockCard() {
  const { t } = useApp();
  const lock = useAppLock();
  if (!lock.available) return null;
  const unsupported = lock.state && !lock.state.supported;
  return (
    <Card>
      <Toggle
        label={t('Verrouiller l’application')}
        description={unsupported ? t('Ce téléphone n’a ni empreinte ni code de verrouillage configuré.') : t('Empreinte ou code du téléphone demandé à l’ouverture et après quelques minutes en arrière-plan.')}
        checked={!!lock.state?.enabled}
        disabled={!lock.state || !!unsupported}
        onChange={lock.set}
      />
    </Card>
  );
}
