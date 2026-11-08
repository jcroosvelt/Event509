import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, CheckCircle2, CloudOff, CloudUpload, Keyboard, RefreshCw, ScanLine, Wifi, XCircle } from 'lucide-react';
import { events } from '@/data/mock';
import { listAttendees, verifyTicket, DEMO } from '@/services/api';
import { load, persist, useApp } from '@/store/app';
import { useOnline, useTitle } from '@/lib/hooks';
import { cx, time } from '@/lib/format';
import { orgOf } from '@/lib/permissions';
import { Badge, Button, Card, Input, PageHeader, ProgressRing, Select, Toggle } from '@/components/ui';
import type { Attendee } from '@/types';

type Reason = 'unknown' | 'used' | 'wrong_event';
type Result =
  | { ok: true; attendee: Attendee; offline: boolean }
  | { ok: false; reason: Reason; attendee?: Attendee; code: string; offline: boolean };

const cacheKey = (eventId: string) => `e509.checkin.${eventId}`;

declare global {
  interface Window {
    BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
  }
}

export default function CheckIn() {
  const { offlineScans, setOfflineScans, toast, lang, t, user } = useApp();
  useTitle(t('Check-in'));
  const myEvents = events.filter((e) => e.organizerId === orgOf(user) && e.status === 'published');
  const [eventId, setEventId] = useState(() => load('e509.checkin.event', myEvents[0]?.id ?? ''));
  const netOnline = useOnline();
  const [forceOffline, setForceOffline] = useState(false);
  const online = netOnline && !forceOffline;
  const [list, setList] = useState<Attendee[]>(() => load(cacheKey(eventId), []));
  const [syncedAt, setSyncedAt] = useState<string | null>(() => load(`${cacheKey(eventId)}.at`, null));
  const [result, setResult] = useState<Result | null>(null);
  const [manual, setManual] = useState('');
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState('');
  const [history, setHistory] = useState<Result[]>([]);
  const [syncing, setSyncing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastCode = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const download = useCallback(async () => {
    const remote = await listAttendees(eventId);
    // Conserver les entrées validées hors ligne et pas encore synchronisées
    const local = new Map(load<Attendee[]>(cacheKey(eventId), []).filter((a) => a.checkedIn).map((a) => [a.code, a]));
    const merged = remote.map((a) => (local.has(a.code) && !a.checkedIn ? { ...a, checkedIn: true, checkedInAt: local.get(a.code)!.checkedInAt } : a));
    setList(merged);
    persist(cacheKey(eventId), merged);
    const at = new Date().toISOString();
    persist(`${cacheKey(eventId)}.at`, at);
    setSyncedAt(at);
  }, [eventId]);

  // Changement d'événement : charger sa liste locale, puis la mettre à jour si on est en ligne
  useEffect(() => {
    persist('e509.checkin.event', eventId);
    setList(load(cacheKey(eventId), []));
    setSyncedAt(load(`${cacheKey(eventId)}.at`, null));
    setHistory([]);
    setResult(null);
    if (netOnline) download();
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = useCallback(
    async (raw: string) => {
      const code = raw.split('.')[0].trim().toUpperCase();
      if (!code) return;
      const now = Date.now();
      if (lastCode.current.code === code && now - lastCode.current.at < 3000) return; // anti double lecture
      lastCode.current = { code, at: now };

      let r: Result;
      const local = list.find((a) => a.code === code);
      if (online) {
        const v = await verifyTicket(code, eventId);
        if (v.ok) r = { ok: true, attendee: v.attendee, offline: false };
        else if (local?.checkedIn) r = { ok: false, reason: 'used', attendee: local, code, offline: false };
        else r = { ok: false, reason: v.reason, attendee: 'attendee' in v ? v.attendee : undefined, code, offline: false };
      } else if (!local) r = { ok: false, reason: 'unknown', code, offline: true };
      else if (local.checkedIn) r = { ok: false, reason: 'used', attendee: local, code, offline: true };
      else {
        r = { ok: true, attendee: { ...local, checkedIn: true, checkedInAt: new Date().toISOString() }, offline: true };
        setOfflineScans((s) => [...s, { code, eventId, at: new Date().toISOString(), synced: false }]);
      }
      if (r.ok) {
        const upd = list.map((a) => (a.code === code ? { ...a, checkedIn: true, checkedInAt: r.attendee!.checkedInAt } : a));
        setList(upd);
        persist(cacheKey(eventId), upd);
      }
      navigator.vibrate?.(r.ok ? 80 : [60, 60, 60]);
      setResult(r);
      setHistory((h) => [r, ...h].slice(0, 20));
    },
    [list, online, eventId, setOfflineScans],
  );

  // Caméra : BarcodeDetector natif si disponible, sinon jsQR
  useEffect(() => {
    if (!camOn) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stop = false;
    const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (stop) return;
          if (v.readyState >= 2) {
            try {
              if (detector) {
                const codes = await detector.detect(v);
                if (codes[0]) await handle(codes[0].rawValue);
              } else {
                const c = canvasRef.current!;
                c.width = v.videoWidth;
                c.height = v.videoHeight;
                const ctx = c.getContext('2d', { willReadFrequently: true })!;
                ctx.drawImage(v, 0, 0);
                const img = ctx.getImageData(0, 0, c.width, c.height);
                const qr = jsQR(img.data, img.width, img.height);
                if (qr) await handle(qr.data);
              }
            } catch {
              /* image illisible : on réessaie à la frame suivante */
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setCamErr(t('La caméra n’est pas accessible. Autorisez-la dans le navigateur ou saisissez le code à la main.'));
        setCamOn(false);
      }
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((x) => x.stop());
    };
  }, [camOn, handle, t]);

  const pendingScans = offlineScans.filter((s) => !s.synced);
  const sync = async () => {
    setSyncing(true);
    for (const s of pendingScans) await verifyTicket(s.code, s.eventId);
    setOfflineScans((all) => all.map((s) => ({ ...s, synced: true })));
    await download();
    setSyncing(false);
    toast(t('{n} entrée(s) synchronisée(s)', { n: pendingScans.length }));
  };

  // Synchronisation automatique au retour du réseau
  useEffect(() => {
    if (online && pendingScans.length && !syncing) sync();
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  const inCount = list.filter((a) => a.checkedIn).length;
  const demo = (kind: 'valid' | 'used' | 'fake') => {
    if (!list.length) return toast(t('La liste des participants se charge, réessayez dans un instant'), 'info');
    const pick = kind === 'valid' ? list.find((a) => !a.checkedIn) : list.find((a) => a.checkedIn);
    handle(kind === 'fake' ? 'E509-FAKE-0000' : pick?.code ?? 'E509-NONE-0000');
  };
  const reasonText: Record<Reason, string> = {
    used: t('Déjà scanné'),
    unknown: t('Billet invalide'),
    wrong_event: t('Billet d’un autre événement'),
  };

  return (
    <div>
      <PageHeader title={t('Check-in')} subtitle={t('Scannez les QR codes à l’entrée. Chaque billet n’est valable qu’une seule fois.')} />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card className={cx('flex flex-wrap items-center gap-4', !online && '!bg-amber-50')}>
            <span aria-hidden className={cx('grid h-11 w-11 place-items-center rounded-full', online ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
              {online ? <Wifi className="h-5 w-5" /> : <CloudOff className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1" role="status">
              <div className="font-bold">{online ? t('En ligne') : t('Mode hors ligne')}</div>
              <div className="text-xs text-ink-soft">
                {online ? t('Validation en temps réel sur le serveur.') : t('Validation sur la liste téléchargée. Les entrées seront synchronisées au retour du réseau.')}
                {syncedAt && <> · {t('Liste mise à jour à {time}', { time: time(syncedAt, lang) })}</>}
              </div>
            </div>
            <div className="w-full border-t border-ink/5 pt-3 sm:w-auto sm:border-0 sm:pt-0">
              <Toggle checked={forceOffline} onChange={setForceOffline} label={t('Forcer hors ligne')} />
            </div>
          </Card>

          <Card className="p-3">
            <div className="relative aspect-square overflow-hidden rounded-3xl bg-navy sm:aspect-video">
              <video ref={videoRef} className={cx('h-full w-full object-cover', !camOn && 'hidden')} playsInline muted aria-label={t('Caméra')} />
              <canvas ref={canvasRef} className="hidden" />
              {!camOn && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
                  <div>
                    <ScanLine className="mx-auto h-14 w-14 text-brand-300" aria-hidden />
                    <p className="mt-3 text-sm text-white/75">{camErr || t('Activez la caméra pour scanner les billets.')}</p>
                    <Button className="mt-4" onClick={() => { setCamErr(''); setCamOn(true); }}><Camera className="h-4 w-4" aria-hidden /> {t('Activer la caméra')}</Button>
                  </div>
                </div>
              )}
              {camOn && (
                <>
                  <div aria-hidden className="pointer-events-none absolute inset-[12%] rounded-3xl border-4 border-white/80" />
                  <div aria-hidden className="pointer-events-none absolute inset-x-[12%] h-0.5 animate-[scanline_2.4s_ease-in-out_infinite] bg-brand shadow-[0_0_12px_#1F5EFF]" />
                  <button type="button" onClick={() => setCamOn(false)} className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-navy" aria-label={t('Couper la caméra')}><CameraOff className="h-4 w-4" aria-hidden /></button>
                </>
              )}

              {result && (
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className={cx('absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white', result.ok ? 'bg-emerald-600/95' : result.reason === 'used' ? 'bg-amber-600/95' : 'bg-red-600/95')}
                >
                  {result.ok ? <CheckCircle2 className="h-20 w-20" aria-hidden /> : <XCircle className="h-20 w-20" aria-hidden />}
                  <span className="text-2xl font-extrabold">{result.ok ? t('Entrée validée') : reasonText[result.reason]}</span>
                  {result.attendee && <span className="text-lg font-semibold">{result.attendee.name} · {result.attendee.ticketType}</span>}
                  {!result.ok && result.reason === 'used' && result.attendee?.checkedInAt && <span className="text-sm">{t('Entré à {time}', { time: time(result.attendee.checkedInAt, lang) })}</span>}
                  {!result.ok && result.reason === 'wrong_event' && result.attendee && <span className="text-sm">{events.find((e) => e.id === result.attendee!.eventId)?.title}</span>}
                  {!result.ok && result.reason === 'unknown' && <span className="font-mono text-sm">{result.code}</span>}
                  {result.offline && <Badge className="!bg-white/20 !text-white">{t('Hors ligne')}</Badge>}
                  <span className="mt-2 text-xs opacity-90">{t('Touchez pour scanner le suivant')}</span>
                </button>
              )}
            </div>

            <p className="sr-only" role="status" aria-live="assertive">
              {result && (result.ok ? `${t('Entrée validée')} : ${result.attendee.name}` : `${reasonText[result.reason]}${result.attendee ? ` : ${result.attendee.name}` : ''}`)}
            </p>
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { handle(manual); setManual(''); } }}>
              <div className="flex-1">
                <label htmlFor="manual-code" className="sr-only">{t('Code du billet')}</label>
                <Input id="manual-code" icon={<Keyboard className="h-4 w-4" />} placeholder={t('Saisir un code (E509-XXXX-XXXX)')} autoComplete="off" autoCapitalize="characters" value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} />
              </div>
              <Button type="submit" variant="dark" className="h-12">{t('Valider')}</Button>
            </form>
            {DEMO && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="self-center text-ink-muted">{t('Démo :')}</span>
                <Button size="sm" variant="soft" onClick={() => demo('valid')}>{t('Billet valide')}</Button>
                <Button size="sm" variant="soft" onClick={() => demo('used')}>{t('Billet déjà utilisé')}</Button>
                <Button size="sm" variant="soft" onClick={() => demo('fake')}>{t('Faux billet')}</Button>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <label htmlFor="ci-ev" className="mb-1.5 block text-sm font-semibold">{t('Événement')}</label>
            <Select id="ci-ev" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              {myEvents.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </Select>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => (netOnline ? download().then(() => toast(t('Liste à jour'))) : toast(t('Connectez-vous à Internet pour mettre à jour la liste'), 'info'))}><RefreshCw className="h-4 w-4" aria-hidden /> {t('Mettre à jour')}</Button>
              <Button className="flex-1" loading={syncing} onClick={() => (!pendingScans.length ? toast(t('Aucune entrée à synchroniser'), 'info') : !online ? toast(t('La synchronisation reprendra au retour du réseau'), 'info') : sync())}>
                <CloudUpload className="h-4 w-4" aria-hidden /> {t('Synchroniser')} ({pendingScans.length})
              </Button>
            </div>
          </Card>

          <Card className="flex items-center gap-5">
            <ProgressRing value={list.length ? inCount / list.length : 0} size={96} stroke={10} track="rgb(var(--canvas))" label={t('{n} % des participants sont entrés', { n: list.length ? Math.round((inCount / list.length) * 100) : 0 })}>
              <div className="text-xl font-extrabold">{list.length ? Math.round((inCount / list.length) * 100) : 0}%</div>
            </ProgressRing>
            <div>
              <div className="text-3xl font-extrabold">{inCount}<span className="text-base font-medium text-ink-muted"> / {list.length}</span></div>
              <div className="text-sm text-ink-soft">{t('participants entrés')}</div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">{t('Derniers scans')}</h2>
            {!history.length && <p className="text-sm text-ink-muted">{t('Aucun scan pour l’instant.')}</p>}
            <ul className="space-y-2" aria-live="polite">
              {history.map((h, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span aria-hidden className={cx('h-2.5 w-2.5 rounded-full', h.ok ? 'bg-emerald-500' : h.reason === 'used' ? 'bg-amber-500' : 'bg-red-500')} />
                  <span className="flex-1 truncate font-medium">{h.attendee?.name ?? (!h.ok ? h.code : '')}</span>
                  <span className="text-xs text-ink-muted">{h.ok ? t('Validé') : reasonText[h.reason]}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
