import { useState } from 'react';
import { Calculator, Check, ClipboardList, KeyRound, Minus, Plus, ScanLine, ShieldCheck, Trash2, UserCog, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { organizers } from '@/data/mock';
import { inviteMember, listTeam, removeMember, updateMember } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { relative } from '@/lib/format';
import { isEmail, useForm } from '@/lib/form';
import { ApiError } from '@/lib/errors';
import { MEMBER_PERMS, orgOf, permLabel, teamPerms, teamRoleLabel } from '@/lib/permissions';
import { Avatar, Badge, Button, Card, Field, IconBadge, Input, Loading, Modal, PageHeader, Select, Table, Td, Toggle, type Tone } from '@/components/ui';
import type { TeamMember, TeamRole } from '@/types';

const roles: Record<TeamRole, { d: string; i: typeof ShieldCheck; tone: Tone }> = {
  admin: { d: 'Accès complet : événements, ventes, équipe, versements', i: ShieldCheck, tone: 'brand' },
  manager: { d: 'Événements, ventes, participants, codes promo et marketing, sans l’équipe ni les versements', i: UserCog, tone: 'violet' },
  lead: { d: 'Scan des billets et liste des participants : supervise les agents de contrôle', i: UserCheck, tone: 'amber' },
  staff: { d: 'Uniquement le scan des billets au check-in', i: ScanLine, tone: 'orange' },
  accountant: { d: 'Ventes, remboursements, versements et factures', i: Calculator, tone: 'green' },
};

/** Rôles de base, disponibles pour tous ; les autres demandent l'avantage « équipes avancées ». */
const BASE_ROLES: TeamRole[] = ['admin', 'accountant', 'staff'];

export default function Team() {
  const { toast, lang, t, user } = useApp();
  useTitle(t('Équipe et rôles'));
  const { data, loading, reload } = useAsync(() => listTeam(), []);
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [busy, setBusy] = useState(false);
  // Avantage « équipes avancées » : le serveur fixe les avantages actifs ; il contrôle de toute façon chaque appel
  const advanced = !!organizers.find((o) => o.id === orgOf(user))?.perks?.includes('team');
  const allRoles = Object.keys(roles) as TeamRole[];
  const roleChoices = (current?: TeamRole) => allRoles.filter((r) => advanced || BASE_ROLES.includes(r) || r === current);
  const [permsFor, setPermsFor] = useState<TeamMember | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const form = useForm(
    { name: '', email: '', role: 'staff' },
    {
      name: (v) => (!String(v).trim() ? t('Indiquez le nom du membre') : undefined),
      email: (v) => (!isEmail(v) ? t('Saisissez une adresse comme nom@domaine.com') : undefined),
    },
  );

  if (loading) return <Loading />;
  const team = data ?? [];
  const admins = team.filter((m) => m.role === 'admin' && m.status === 'active').length;

  const invite = async () => {
    if (!form.validate()) return;
    setBusy(true);
    try {
      await inviteMember({ name: form.values.name, email: form.values.email, role: form.values.role as TeamRole });
      setOpen(false);
      toast(t('Invitation envoyée à {email}', { email: form.values.email }));
      form.reset();
      reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) form.setErrors({ email: t('Cette personne fait déjà partie de l’équipe') });
      else toast(t('L’invitation n’a pas pu être envoyée. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (m: TeamMember, role: TeamRole) => {
    if (m.role === 'admin' && role !== 'admin' && admins <= 1) {
      toast(t('Gardez au moins un administrateur dans l’équipe'), 'info');
      return;
    }
    await updateMember(m.id, { role });
    toast(t('{name} est maintenant {role}', { name: m.name, role: t(teamRoleLabel[role]).toLowerCase() }));
    reload();
  };

  return (
    <div>
      <PageHeader title={t('Équipe et rôles')} subtitle={t('Invitez votre équipe et contrôlez ce que chacun peut faire.')} actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> {t('Inviter')}</Button>} />
      <div className="mb-6 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {roleChoices().map((r) => {
          const R = roles[r];
          return (
            <Card key={r}>
              <IconBadge tone={R.tone}><R.i className="h-[18px] w-[18px]" /></IconBadge>
              <h2 className="mt-3 font-bold">{t(teamRoleLabel[r])}</h2>
              <p className="text-sm text-ink-soft">{t(R.d)}</p>
              <div className="mt-3 text-2xl font-extrabold">{team.filter((m) => m.role === r).length}</div>
            </Card>
          );
        })}
      </div>

      <Card className="mb-6">
        <Table caption={t('Membres de l’équipe')} head={[t('Membre'), t('Rôle'), t('Statut'), t('Dernière activité'), '']}>
          {team.map((m) => {
            const isMe = m.email === user?.email;
            return (
              <tr key={m.id}>
                <Td><span className="flex items-center gap-3"><Avatar name={m.name} size={36} /><span><b className="block">{m.name}{isMe && ` (${t('vous')})`}</b><span className="text-xs text-ink-muted">{m.email}</span></span></span></Td>
                <Td>
                  <label className="sr-only" htmlFor={`role-${m.id}`}>{t('Rôle de {name}', { name: m.name })}</label>
                  <Select id={`role-${m.id}`} value={m.role} onChange={(e) => changeRole(m, e.target.value as TeamRole)} className="h-10 w-44" disabled={isMe}>
                    {roleChoices(m.role).map((r) => <option key={r} value={r}>{t(teamRoleLabel[r])}</option>)}
                  </Select>
                  {m.perms && <Badge tone="violet" className="mt-1">{t('Permissions personnalisées')}</Badge>}
                </Td>
                <Td><Badge tone={m.status === 'active' ? 'green' : 'amber'}>{m.status === 'active' ? t('Actif') : t('Invitation envoyée')}</Badge></Td>
                <Td className="text-ink-soft">{m.lastActive ? relative(m.lastActive, lang) : '—'}</Td>
                <Td><span className="flex gap-1">
                  {advanced && m.role !== 'admin' && <Button size="sm" variant="ghost" aria-label={t('Permissions de {name}', { name: m.name })} onClick={() => { setPermsFor(m); setPicked(m.perms ?? teamPerms[m.role]); }}><KeyRound className="h-4 w-4" aria-hidden /></Button>}
                  {!isMe && <Button size="sm" variant="ghost" aria-label={t('Retirer {name}', { name: m.name })} onClick={() => setRemoving(m)}><Trash2 className="h-4 w-4" aria-hidden /></Button>}
                </span></Td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card>
        <h2 className="mb-4 font-bold">{t('Permissions par rôle')}</h2>
        <Table caption={t('Permissions par rôle')} head={[t('Permission'), ...roleChoices().map((r) => t(teamRoleLabel[r]))]}>
          {[...MEMBER_PERMS, 'team' as const].map((p) => (
            <tr key={p}>
              <Td className="font-medium">{t(p === 'team' ? 'Gérer l’équipe' : permLabel[p]!)}</Td>
              {roleChoices().map((r) => <Td key={r}>{teamPerms[r].includes(p) ? <Check className="h-4 w-4 text-emerald-600" aria-label={t('Oui')} /> : <Minus className="h-4 w-4 text-ink-muted" aria-label={t('Non')} />}</Td>)}
            </tr>
          ))}
        </Table>
        {advanced && <Link to="/organisateur/activite" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-ink"><ClipboardList className="h-4 w-4" aria-hidden /> {t('Voir le journal d’activité et les entrées par agent')}</Link>}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t('Inviter un membre')} size="sm" footer={<Button className="flex-1" onClick={invite} loading={busy}>{t('Envoyer l’invitation')}</Button>}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); invite(); }} className="space-y-4">
          <Field label={t('Nom')} error={form.errors.name} required><Input autoComplete="off" {...form.bind('name')} /></Field>
          <Field label={t('Email')} error={form.errors.email} required><Input type="email" autoComplete="off" {...form.bind('email')} /></Field>
          <Field label={t('Rôle')} hint={t(roles[form.values.role as TeamRole].d)}>
            <Select {...form.bind('role')}>
              {roleChoices().map((r) => <option key={r} value={r}>{t(teamRoleLabel[r])}</option>)}
            </Select>
          </Field>
        </form>
      </Modal>

      <Modal
        open={!!permsFor}
        onClose={() => setPermsFor(null)}
        title={t('Permissions de {name}', { name: permsFor?.name ?? '' })}
        description={t('Cochez ce que cette personne peut faire. Décochez tout pour revenir aux permissions de son rôle.')}
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setPermsFor(null)}>{t('Annuler')}</Button>
            <Button className="flex-1" loading={busy} onClick={async () => {
              setBusy(true);
              try {
                const same = picked.length === teamPerms[permsFor!.role].length && picked.every((p) => teamPerms[permsFor!.role].includes(p as never));
                await updateMember(permsFor!.id, { perms: picked.length && !same ? picked : null } as Partial<TeamMember>);
                toast(t('Permissions enregistrées'));
                setPermsFor(null);
                reload();
              } catch (e) {
                toast(e instanceof Error ? e.message : t('Action impossible. Réessayez.'), 'error');
              } finally {
                setBusy(false);
              }
            }}>{t('Enregistrer')}</Button>
          </>
        }
      >
        <fieldset className="space-y-3">
          <legend className="sr-only">{t('Permissions')}</legend>
          {MEMBER_PERMS.map((p) => <Toggle key={p} checked={picked.includes(p)} onChange={(v) => setPicked(v ? [...picked, p] : picked.filter((x) => x !== p))} label={t(permLabel[p]!)} />)}
        </fieldset>
      </Modal>

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t('Retirer {name} ?', { name: removing?.name ?? '' })}
        description={t('Cette personne perd immédiatement l’accès à l’espace organisateur.')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setRemoving(null)}>{t('Annuler')}</Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={async () => {
                if (removing!.role === 'admin' && admins <= 1) {
                  toast(t('Gardez au moins un administrateur dans l’équipe'), 'info');
                  return;
                }
                await removeMember(removing!.id);
                toast(t('{name} a été retiré de l’équipe', { name: removing!.name }));
                setRemoving(null);
                reload();
              }}
            >
              {t('Retirer')}
            </Button>
          </>
        }
      >
        <span />
      </Modal>
    </div>
  );
}
