import { useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { Conversations } from '@/components/Conversations';

export default function OrgMessages() {
  const { t } = useApp();
  useTitle(t('Messages des participants'));
  return <Conversations mode="org" />;
}
