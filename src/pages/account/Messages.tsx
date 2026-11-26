import { useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { Conversations } from '@/components/Conversations';

export default function Messages() {
  const { t } = useApp();
  useTitle(t('Mes messages'));
  return <Conversations mode="user" />;
}
