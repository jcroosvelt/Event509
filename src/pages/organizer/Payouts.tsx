import { useState } from 'react';
import { Download, Smartphone, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DEMO, listPayouts, payoutEvents, payoutSecurity, requestPayout, type PayoutEvent, type PayoutProof } from '@/services/api';
import { ApiError } from '@/lib/errors';
import { getPasskeyAssertion, passkeyCancelled } from '@/lib/webauthn';
import ReauthModal from '@/components/ReauthModal';
import { organizers } from '@/data/mock';
import { useAsync, useTitle } from '@/lib/hooks';
import { load, persist, useApp } from '@/store/app';
import { dateNumeric, moneyRaw } from '@/lib/format';
import { PAYOUT_LAST_DAYS, PAYOUT_MIN_SOLD } from '@/lib/payouts';
import { exportCSV } from '@/lib/export';
import { destinationText } from '@/lib/labels';
import { orgOf } from '@/lib/permissions';
import { cleanNumber, isEmail, isPhone, useForm } from '@/lib/form';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, Segmented, Table, Td, Toggle, type Tone } from '@/components/ui';
import type { Payout } from '@/types';
import { intlLocale } from '@/lib/i18n';

const method: Record<Payout['method'], { l: string; i: typeof Wallet }> = {
  moncash: { l: 'MonCash', i: Smartphone },
  natcash: { l: 'NatCash', i: Smartphone },
  paypal: { l: 'PayPal', i: Wallet },
};
const status: Record<Payout['status'], { l: string; tone: Tone }> = {
  requested: { l: 'En attente de validation', tone: 'gray' },
  rejected: { l: 'Refusé', tone: 'red' },
  paid: { l: 'Versé', tone: 'green' },
  processing: { l: 'En cours', tone: 'amber' },
  scheduled: { l: 'Programmé', tone: 'brand' },
};

const lastKey = (orgId: string) => `e509.payoutDest.${orgId}`;
interface Last { method: Payout['method']; name: string; phone: string; email: string }

export default function Payouts() {
  const { lang, toast, t, user } = useApp();
  useTitle(t('Versements'));
  const orgId = orgOf(user);
  const { data, loading, reload } = useAsync(() => Promise.all([listPayouts(orgId), payoutEvents(orgId)]), [orgId]);
  // Événement dont on demande le versement (un versement porte toujours sur un seul événement)
  const [target, setTarget] = useState<PayoutEvent | null>(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Avantage « finance » : demande prioritaire (traitée en premier, toujours validée par l'administration)
  const canPriority = !DEMO && !!organizers.find((o) => o.id === orgOf(user))?.perks?.includes('finance');
  const [priority, setPriority] = useState(false);
  // Sécurité du versement : 1. identité récente, 2. empreinte (passkey), 3. questions
  const [reauth, setReauth] = useState(false);
  const [questions, setQuestions] = useState<{ position: number; question: string }[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [passkey, setPasskey] = useState<PayoutProof['passkey'] | null>(null);
  const [setup, setSetup] = useState<string | null>(null);
  const empty: Last = { method: 'moncash', name: '', phone: '', email: '' };
  // La dernière destination utilisée est proposée de nouveau, mais reste modifiable
  const last = load<Last>(lastKey(orgId), empty);
  const req = useForm(
    { amount: '', method: last.method as string, name: last.name, phone: last.phone, email: last.email },
    {
      amount: (v) => (!(Number(v) > 0) ? t('Indiquez un montant supérieur à 0') : undefined),
      name: (v, all) => (all.method !== 'paypal' && String(v).trim().split(/\s+/).filter((w) => w.length >= 2).length < 2 ? t('Indiquez le nom complet du titulaire (prénom et nom)') : undefined),
      phone: (v, all) => (all.method !== 'paypal' && !isPhone(v) ? t('Saisissez un numéro comme +509 3712 3456') : undefined),
      email: (v, all) => (all.method === 'paypal' && !isEmail(v) ? t('Saisissez votre adresse email PayPal') : undefined),
    },
  );

  if (loading || !data) return <Loading />;
  const [payouts, events] = data;
  const cur = target?.currency ?? 'HTG';
  const max = target?.payable ?? 0;
  const m = req.values.method as Payout['method'];
  const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : intlLocale(lang), { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  /** Pourquoi l'argent d'un événement n'est pas encore versable. */
  const why = (e: PayoutEvent) =>
    e.reason === 'status' ? t('Événement non publié')
    : e.reason === 'window' ? t('Délai de remboursement ouvert jusqu’au {date}', { date: dateOf(e.availableAt) })
    : t('Il faut {min} % de billets payants vendus (vous en êtes à {n} %), ou attendre le {date}', { min: PAYOUT_MIN_SOLD, n: e.percentSold, date: dateOf(e.availableAt) });

  const form = () => {
    if (!req.validate()) return null;
    const amount = Number(req.values.amount);
    if (amount > max) { req.setErrors({ amount: t('Le montant dépasse l’argent versable de cet événement ({max})', { max: moneyRaw(max, cur, lang) }) }); return null; }
    const destination = m === 'paypal' ? { email: req.values.email.trim() } : { name: req.values.name.trim(), phone: req.values.phone.trim() };
    return { amount, destination };
  };

  // Étapes 1 et 2 : identité récente puis empreinte digitale (passkey)
  const secure = async () => {
    if (!form()) return;
    if (DEMO) return send();
    setBusy(true);
    try {
      const s = await payoutSecurity(orgId);
      if (!s.hasPasskey) return setSetup(t('Ajoutez d’abord une passkey (empreinte digitale) dans Sécurité.'));
      if (!s.questions.length) return setSetup(t('Choisissez d’abord vos questions de sécurité dans Sécurité.'));
      if (!s.recent) return setReauth(true);
      const response = await getPasskeyAssertion(s.passkey!.options);
      setPasskey({ challengeId: s.passkey!.challengeId, response });
      setAnswers(s.questions.map(() => ''));
      setQuestions(s.questions);
    } catch (e) {
      if (!passkeyCancelled(e)) toast(t('Vérification impossible. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  // Étape 3 : réponses aux questions, puis envoi de la demande
  const send = async () => {
    const f = form();
    if (!f) return;
    setBusy(true);
    try {
      await requestPayout(orgId, target!.eventId, f.amount, m, f.destination, priority, passkey ? { passkey, answers } : undefined);
      persist(lastKey(orgId), { method: m, name: req.values.name, phone: req.values.phone, email: req.values.email });
      setReqOpen(false);
      setTarget(null);
      setQuestions(null);
      setPasskey(null);
      toast(t('Demande envoyée : Event509 la valide sous 24 h, puis envoie l’argent à la destination indiquée'));
      reload();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      if (code === 'answers_invalid') toast(t('Réponses incorrectes. Réessayez.'), 'error');
      else if (code === 'reauth_required') { setQuestions(null); setReauth(true); }
      else if (code === 'passkey_required') { setQuestions(null); toast(t('Empreinte non confirmée. Recommencez.'), 'error'); }
      else if (code === 'payout_not_available' || code === 'amount_too_high') { setReqOpen(false); setTarget(null); toast(e instanceof ApiError ? e.message : t('Versement impossible pour cet événement.'), 'error'); reload(); }
      else toast(t('La demande n’a pas pu être envoyée. Vérifiez les informations et réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const askPayout = () => (questions ? send() : secure());

  return (
    <div>
      <PageHeader title={t('Versements')} subtitle={t('Demandez le versement de vos revenus nets : Event509 le valide, puis envoie l’argent là où vous l’indiquez.')} />

      <Card className="mb-6">
        <h2 className="font-bold">{t('Argent à verser, événement par événement')}</h2>
        <p className="mb-4 mt-1 text-sm text-ink-soft">{t('L’argent d’un événement peut être versé quand son délai de remboursement est terminé et que {min} % des billets payants sont vendus (ou à {days} jours de l’événement, quel que soit le nombre de billets vendus).', { min: PAYOUT_MIN_SOLD, days: PAYOUT_LAST_DAYS })}</p>
        {!events.length ? (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title={t('Aucun événement publié')} body={t('Les versements apparaissent dès qu’un événement est publié.')} />
        ) : (
          <Table caption={t('Argent à verser par événement')} head={[t('Événement'), t('Billets vendus'), t('Net à verser'), t('Versement')]}>
            {events.map((e) => (
              <tr key={e.eventId}>
                <Td><b className="block">{e.title}</b><span className="text-xs text-ink-muted">{e.refundDays === 0 ? t('Aucun remboursement') : t('Remboursement jusqu’à {n} jour(s) avant', { n: e.refundDays })}</span></Td>
                <Td>{e.percentSold} %</Td>
                <Td className="font-bold">{moneyRaw(e.net, e.currency, lang)}</Td>
                <Td>
                  {e.eligible && e.payable >= 1 ? (
                    <Button size="sm" onClick={() => { setQuestions(null); setPasskey(null); setSetup(null); setTarget(e); req.reset({ amount: String(Math.floor(e.payable)), method: last.method, name: last.name, phone: last.phone, email: last.email }); setReqOpen(true); }}>{t('Demander')}</Button>
                  ) : e.eligible ? (
                    <span className="text-xs text-ink-muted">{t('Rien à verser pour l’instant')}</span>
                  ) : (
                    <span className="text-xs text-ink-soft">{why(e)}</span>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">{t('Historique des versements')}</h2>
          {payouts.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => exportCSV(payouts.map((p) => ({ [t('Référence')]: p.reference, [t('Date')]: p.date, [t('Montant')]: p.amount, [t('Devise')]: p.currency, [t('Méthode')]: t((method[p.method] ?? { l: String(p.method) }).l), [t('Destination')]: destinationText(p), [t('Statut')]: t((status[p.status] ?? { l: String(p.status) }).l) })), 'versements')}>
              <Download className="h-4 w-4" aria-hidden /> {t('Exporter')}
            </Button>
          )}
        </div>
        {!payouts.length ? (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title={t('Aucun versement pour l’instant')} />
        ) : (
          <Table caption={t('Historique des versements')} head={[t('Référence'), t('Événement'), t('Date'), t('Destination'), t('Montant'), t('Statut')]}>
            {payouts.map((p) => {
              const M = method[p.method] ?? { l: String(p.method ?? '—'), i: Wallet };
              const st = status[p.status] ?? { l: String(p.status ?? '—'), tone: 'gray' as Tone };
              return (
                <tr key={p.id}>
                  <Td className="font-mono text-xs">{p.reference}</Td>
                  <Td className="text-ink-soft">{p.eventTitle ?? '—'}</Td>
                  <Td className="text-ink-soft">{dateNumeric(p.date, lang)}</Td>
                  <Td><span className="flex items-center gap-2"><M.i className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden /><span><b className="block">{t(M.l)}</b><span className="text-xs text-ink-muted">{destinationText(p)}</span></span></span></Td>
                  <Td className="font-bold">{moneyRaw(p.amount, p.currency, lang)}</Td>
                  <Td><Badge tone={st.tone}>{t(st.l)}</Badge></Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Modal open={reqOpen} onClose={() => setReqOpen(false)} title={t('Demander un versement')} description={t('{event} · versable : {max}', { event: target?.title ?? '', max: moneyRaw(max, cur, lang) })} size="sm" footer={<Button className="flex-1" onClick={() => void askPayout()} loading={busy} disabled={!!questions && answers.some((a) => !a.trim())}>{questions ? t('Envoyer la demande') : t('Continuer')}</Button>}>
        <p className="mb-4 rounded-2xl bg-canvas p-3 text-xs text-ink-soft">{t('Pour éviter les fraudes, un versement demande 3 vérifications : identité récente, empreinte digitale (passkey) et vos questions de sécurité.')}</p>
        {setup && (
          <div role="alert" className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
            {setup} <Link to="/compte/securite" className="font-bold underline">{t('Ouvrir Sécurité')}</Link>
          </div>
        )}
        {questions ? (
          <form noValidate onSubmit={(e) => { e.preventDefault(); void send(); }} className="space-y-4">
            <p className="text-sm font-semibold">{t('Empreinte confirmée. Dernière étape : vos questions de sécurité.')}</p>
            {questions.map((q, i) => (
              <Field key={q.position} label={q.question} required>
                <Input autoComplete="off" value={answers[i] ?? ''} onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))} />
              </Field>
            ))}
            <button type="submit" hidden />
          </form>
        ) : (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void askPayout(); }} className="space-y-4">
          <Field label={t('Montant ({cur})', { cur })} error={req.errors.amount} required>
            <Input type="text" inputMode="decimal" autoComplete="off" {...req.bind('amount')} onChange={(e) => req.set('amount', cleanNumber(e.target.value, true))} />
          </Field>
          <Segmented
            label={t('Où envoyer l’argent ?')}
            className="flex w-full [&>button]:flex-1"
            value={m}
            onChange={(v) => req.set('method', v)}
            options={(Object.keys(method) as Payout['method'][]).map((k) => ({ value: k, label: method[k].l }))}
          />
          {m === 'paypal' ? (
            <Field label={t('Adresse email PayPal')} error={req.errors.email} required>
              <Input type="email" inputMode="email" autoComplete="email" {...req.bind('email')} />
            </Field>
          ) : (
            <>
              <Field label={t('Nom complet du titulaire du compte {method}', { method: method[m].l })} error={req.errors.name} hint={t('Exactement comme il apparaît sur le compte')} required>
                <Input autoComplete="name" {...req.bind('name')} />
              </Field>
              <Field label={t('Numéro {method}', { method: method[m].l })} error={req.errors.phone} required>
                <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="+509 3712 3456" {...req.bind('phone')} />
              </Field>
            </>
          )}
          {canPriority && <Toggle checked={priority} onChange={setPriority} label={t('Demande prioritaire')} description={t('Traitée en premier, mais soumise aux mêmes contrôles financiers et délais de traitement.')} />}
        </form>
        )}
      </Modal>
      {reauth && <ReauthModal next="/organisateur/versements" onClose={() => setReauth(false)} onDone={() => { setReauth(false); void secure(); }} />}
    </div>
  );
}
