import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { DEMO } from '@/services/api';
import { getTeamActivity } from '@/services/premium';
import { ApiError } from '@/lib/errors';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { relative } from '@/lib/format';
import { teamRoleLabel } from '@/lib/permissions';
import { Card, EmptyState, Field, Loading, PageHeader, Segmented, Select, Table, Td } from '@/components/ui';
import type { TeamRole } from '@/types';

/** Actions enregistrées par le serveur (en français) : traduites à l'affichage. */
const actionLabels: Record<string, string> = {
  'Entrée validée': 'Entrée validée', 'Membre invité': 'Membre invité', 'Rôle modifié': 'Rôle modifié', 'Permissions modifiées': 'Permissions modifiées', 'Membre retiré': 'Membre retiré',
  'Événement créé': 'Événement créé', 'Événement modifié': 'Événement modifié', 'Statut d’événement modifié': 'Statut d’événement modifié', 'Événement supprimé': 'Événement supprimé',
  'Remboursement accepté': 'Remboursement accepté', 'Remboursement refusé': 'Remboursement refusé',
};

/** Suivi des équipes : entrées validées par chaque agent de contrôle, et journal des actions (qui a fait quoi, quand). */
export default function Activity() {
  const { t, lang } = useApp();
  useTitle(t('Activité de l’équipe'));
  const [tab, setTab] = useState<'agents' | 'journal'>('agents');
  const [user, setUser] = useState('');
  const q = useAsync(() => (DEMO ? Promise.resolve(null) : getTeamActivity(user)), [user]);
  if (DEMO) return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Programme disponible sur le site en ligne')} body={t('Le suivi des équipes nécessite le serveur.')} />;
  if (q.error instanceof ApiError && q.error.status === 403)
    return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Réservé aux organisateurs vérifiés')} body={t('Rôles avancés, permissions personnalisées, entrées par agent et journal d’activité.')} action={<Link to="/organisateur-verifie" className="font-semibold text-brand-ink">{t('Découvrir le programme')}</Link>} />;
  if (!q.data) return <Loading />;
  const d = q.data;
  const total = new Map<string, { name: string; scans: number; last: string | null }>();
  for (const a of d.agents) {
    const k = a.id ?? a.name;
    const cur = total.get(k) ?? { name: a.name, scans: 0, last: null as string | null };
    cur.scans += a.scans;
    if (a.last && (!cur.last || a.last > cur.last)) cur.last = a.last;
    total.set(k, cur);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('Activité de l’équipe')} subtitle={t('Qui a scanné quoi, et qui a modifié quoi.')} actions={<Link to="/organisateur/equipe" className="text-sm font-semibold text-brand-ink">{t('Gérer l’équipe')}</Link>} />
      <Segmented label={t('Affichage')} value={tab} onChange={setTab} options={[{ value: 'agents', label: t('Entrées par agent') }, { value: 'journal', label: t('Journal d’activité') }]} />

      {tab === 'agents' ? (
        <>
          <Card className="!p-0 overflow-hidden">
            <Table caption={t('Entrées par agent')} head={[t('Agent'), t('Entrées validées'), t('Dernière entrée')]}>
              {[...total.values()].sort((a, b) => b.scans - a.scans).map((a) => <tr key={a.name}><Td className="font-semibold">{a.name}</Td><Td>{a.scans}</Td><Td className="text-ink-soft">{a.last ? relative(a.last, lang) : '—'}</Td></tr>)}
              {!total.size && <tr><Td className="text-ink-muted">{t('Aucune entrée validée pour le moment.')}</Td><Td /><Td /></tr>}
            </Table>
          </Card>
          {d.agents.length > 0 && (
            <Card className="!p-0 overflow-hidden">
              <Table caption={t('Entrées par agent et par événement')} head={[t('Événement'), t('Agent'), t('Entrées validées')]}>
                {d.agents.map((a, i) => <tr key={i}><Td className="max-w-[260px] truncate">{a.event}</Td><Td className="font-semibold">{a.name}</Td><Td>{a.scans}</Td></tr>)}
              </Table>
            </Card>
          )}
        </>
      ) : (
        <>
          <div className="max-w-xs">
            <Field label={t('Membre')}>
              <Select value={user} onChange={(e) => setUser(e.target.value)}>
                <option value="">{t('Toute l’équipe')}</option>
                {d.members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role ? ` — ${t(teamRoleLabel[m.role as TeamRole] ?? m.role)}` : ''}</option>)}
              </Select>
            </Field>
          </div>
          <Card className="!p-0 overflow-hidden">
            <Table caption={t('Journal d’activité')} head={[t('Quand'), t('Membre'), t('Action'), t('Détail')]}>
              {d.logs.map((l) => <tr key={l.id}><Td className="whitespace-nowrap text-ink-soft">{new Date(l.at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}</Td><Td className="font-semibold">{l.user}</Td><Td>{t(actionLabels[l.action] ?? l.action)}</Td><Td className="max-w-[260px] truncate text-ink-soft">{l.target}</Td></tr>)}
              {!d.logs.length && <tr><Td className="text-ink-muted">{t('Aucune activité enregistrée.')}</Td><Td /><Td /><Td /></tr>}
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
