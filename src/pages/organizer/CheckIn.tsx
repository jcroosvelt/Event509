import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import jsQR from 'jsqr';
import { inApp, postApp } from '@/lib/appBridge';
import { ArrowLeft, Armchair, Camera, CameraOff, CheckCircle2, CloudOff, CloudUpload, Keyboard, RefreshCw, ScanLine, Wifi, XCircle } from 'lucide-react';
import { events } from '@/data/mock';
import { getEvent, listAttendees, lookupTicket, verifyTicket, DEMO, type TicketCheck } from '@/services/api';
import { ApiError } from '@/lib/errors';
import { load, persist, useApp } from '@/store/app';
import { useAsync, useOnline, useTitle } from '@/lib/hooks';
import { cx, dateShort, time } from '@/lib/format';
import { Badge, Button, Card, Input, Loading, PageHeader, ProgressRing, Toggle } from '@/components/ui';
import NotFound from '../public/NotFound';
import type { Attendee } from '@/types';

type Reason = 'unknown' | 'used' | 'wrong_event' | 'inactive';
/** Dernière lecture : billet valide en attente de validation, ou billet refusé. */
type Result =
  | { ok: true; attendee: Attendee; offline: boolean }
  | { ok: false; reason: Reason; attendee?: Attendee; code: string; offline: boolean };

const cacheKey = (eventId: string) => `e509.checkin.${eventId}`;

declare global {
  interface Window {
    BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
  }
}

/** Écran de contrôle d'un événement : le chemin est /organisateur/checkin/:id (voir CheckInHome pour le choix). */
export default function CheckInPage() {
  const { id = '' } = useParams();
  const { data: ev, loading } = useAsync(() => getEvent(id), [id]);
  if (loading) return <Loading />;
  if (!ev) return <NotFound />;
  return <CheckIn key={ev.id} eventId={ev.id} title={ev.title} start={ev.start} />;
}

function CheckIn({ eventId, title, start }: { eventId: string; title: string; start: string }) {
  const { offlineScans, setOfflineScans, toast, lang, t } = useApp();
  useTitle(t('Contrôle d’entrée'));
  const netOnline = useOnline();
  const [forceOffline, setForceOffline] = useState(false);
  const online = netOnline && !forceOffline;
  const [list, setList] = useState<Attendee[]>(() => load(cacheKey(eventId), []));
  const [syncedAt, setSyncedAt] = useState<string | null>(() => load(`${cacheKey(eventId)}.at`, null));
  const [result, setResult] = useState<Result | null>(null);
  const [flash, setFlash] = useState<Attendee | null>(null);
  const [manual, setManual] = useState('');
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState('');
  const [history, setHistory] = useState<Result[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastCode = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  // Le scan est en pause tant qu'un résultat attend l'organisateur, et reprend dès qu'il répond
  const paused = useRef(false);
  paused.current = !!result || busy;
  // Une fois la caméra utilisée, elle se rallume d'elle-même après chaque validation
  const wantCam = useRef(false);

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

  useEffect(() => {
    if (netOnline) void download().catch(() => {});
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Caméra déjà autorisée : elle démarre toute seule en entrant dans l'événement
  useEffect(() => {
    let alive = true;
    navigator.permissions?.query({ 'name': 'camera' } as unknown as PermissionDescriptor).then((p) => {
      if (alive && p.state === 'granted') {
        wantCam.current = true;
        setCamOn(true);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const markLocal = (code: string, at: string) => {
    setList((cur) => {
      const upd = cur.map((a) => (a.code === code ? { ...a, checkedIn: true, checkedInAt: at } : a));
      persist(cacheKey(eventId), upd);
      return upd;
    });
  };

  /** Étape 1 : lire le billet et montrer à l'organisateur de qui il s'agit. Rien n'est modifié. */
  const handle = useCallback(
    async (raw: string, manual = false) => {
      if (paused.current) return;
      const code = raw.split('.')[0].trim().toUpperCase();
      if (!code) return;
      const now = Date.now();
      // Anti double lecture : seulement pour la caméra, qui relit le même QR code plusieurs fois par seconde
      if (!manual && lastCode.current.code === code && now - lastCode.current.at < 3000) return;
      lastCode.current = { code, at: now };
      paused.current = true;

      const local = list.find((a) => a.code === code);
      const fromList = (): Result =>
        !local ? { ok: false, reason: 'unknown', code, offline: true }
        : local.checkedIn ? { ok: false, reason: 'used', attendee: local, code, offline: true }
        : { ok: true, attendee: local, offline: true };
      let r: Result;
      if (online) {
        try {
          const v: TicketCheck = await lookupTicket(code, eventId);
          r = v.ok ? { ok: true, attendee: v.attendee, offline: false } : { ok: false, reason: v.reason, attendee: v.attendee, code, offline: false };
          // Validé hors ligne sur cet appareil mais pas encore synchronisé : déjà entré
          if (r.ok && local?.checkedIn) r = { ok: false, reason: 'used', attendee: local, code, offline: false };
        } catch (e) {
          // Réseau perdu en cours de route : on continue avec la liste téléchargée
          if (e instanceof ApiError && e.status === 0) r = fromList();
          else {
            paused.current = false;
            toast(t('La vérification a échoué. Réessayez.'), 'error');
            return;
          }
        }
      } else r = fromList();
      navigator.vibrate?.(r.ok ? 80 : [60, 60, 60]);
      setResult(r);
    },
    [list, online, eventId, toast, t],
  );

  /** Reprise du scan : on referme le résultat, et la caméra se rallume si elle avait été utilisée. */
  const resume = useCallback(() => {
    setResult(null);
    if (wantCam.current) setCamOn(true);
  }, []);

  /** Étape 2 : l'organisateur valide l'entrée. Le serveur ne l'accepte qu'une seule fois par billet. */
  const confirmEntry = async () => {
    if (!result?.ok) return;
    const code = result.attendee.code;
    setBusy(true);
    try {
      let attendee = result.attendee;
      let offline = result.offline;
      if (!offline) {
        try {
          const v = await verifyTicket(code, eventId);
          if (!v.ok) {
            // Un autre contrôleur vient de le valider
            const refused: Result = { ok: false, reason: v.reason, attendee: v.attendee, code, offline: false };
            setHistory((h) => [refused, ...h].slice(0, 20));
            setResult(refused);
            return;
          }
          attendee = v.attendee;
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 0)) throw e;
          offline = true;
        }
      }
      const at = attendee.checkedInAt ?? new Date().toISOString();
      if (offline) setOfflineScans((s) => [...s, { code, eventId, at, synced: false }]);
      markLocal(code, at);
      setHistory((h) => [{ ok: true, attendee: { ...attendee, checkedIn: true, checkedInAt: at }, offline } as Result, ...h].slice(0, 20));
      setFlash(attendee);
      window.setTimeout(() => setFlash(null), 1800);
      resume();
    } catch {
      toast(t('La validation a échoué. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Billet refusé ou entrée annulée : on note la lecture et le scan reprend. */
  const dismiss = () => {
    if (result && !result.ok) setHistory((h) => [result, ...h].slice(0, 20));
    resume();
  };

  // Caméra : BarcodeDetector natif si disponible, sinon jsQR
  useEffect(() => {
    if (!camOn) return;
    // Application Android : scanner natif plein écran, plus rapide et plus fiable que la caméra de la page
    if (inApp()) {
      wantCam.current = true;
      window.onQrScanned = (code: string) => {
        setCamOn(false);
        void handle(code);
      };
      window.onQrScanCancelled = () => {
        wantCam.current = false;
        setCamOn(false);
      };
      postApp('scan:start');
      return () => {
        window.onQrScanned = undefined;
        window.onQrScanCancelled = undefined;
      };
    }
    let stream: MediaStream | null = null;
    let raf = 0;
    let stop = false;
    const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        wantCam.current = true;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (stop) return;
          if (v.readyState >= 2 && !paused.current) {
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

  const pendingScans = offlineScans.filter((s) => !s.synced && s.eventId === eventId);
  const sync = async () => {
    setSyncing(true);
    for (const s of pendingScans) await verifyTicket(s.code, s.eventId).catch(() => {});
    setOfflineScans((all) => all.map((s) => (s.eventId === eventId ? { ...s, synced: true } : s)));
    await download().catch(() => {});
    setSyncing(false);
    toast(t('{n} entrée(s) synchronisée(s)', { n: pendingScans.length }));
  };

  // Synchronisation automatique au retour du réseau
  useEffect(() => {
    if (online && pendingScans.length && !syncing) void sync();
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  const inCount = list.filter((a) => a.checkedIn).length;
  const demo = (kind: 'valid' | 'used' | 'fake') => {
    if (!list.length) return toast(t('La liste des participants se charge, réessayez dans un instant'), 'info');
    const pick = kind === 'valid' ? list.find((a) => !a.checkedIn) : list.find((a) => a.checkedIn);
    void handle(kind === 'fake' ? 'E509-FAKE-0000' : pick?.code ?? 'E509-NONE-0000', true);
  };
  const reasonText: Record<Reason, string> = {
    used: t('Déjà scanné'),
    unknown: t('Billet invalide'),
    wrong_event: t('Billet d’un autre événement'),
    inactive: t('Billet annulé ou remboursé'),
  };
  const other = result && !result.ok && result.reason === 'wrong_event' && result.attendee ? events.find((e) => e.id === result.attendee!.eventId)?.title : undefined;

  return (
    <div>
      <Link to="/organisateur/checkin" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" aria-hidden /> {t('Tous les événements')}</Link>
      <PageHeader title={title} subtitle={`${dateShort(start, lang)} · ${t('Scannez les QR codes à l’entrée. Chaque billet n’est valable qu’une seule fois.')}`} />

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
              {!camOn && !result && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
                  <div>
                    <ScanLine className="mx-auto h-14 w-14 text-brand-300" aria-hidden />
                    <p className="mt-3 text-sm text-white/75">{camErr || t('Activez la caméra pour scanner les billets.')}</p>
                    <Button className="mt-4" onClick={() => { setCamErr(''); wantCam.current = true; setCamOn(true); }}><Camera className="h-4 w-4" aria-hidden /> {t('Activer la caméra')}</Button>
                  </div>
                </div>
              )}
              {camOn && !result && (
                <>
                  <div aria-hidden className="pointer-events-none absolute inset-[12%] rounded-3xl border-4 border-white/80" />
                  <div aria-hidden className="pointer-events-none absolute inset-x-[12%] h-0.5 animate-[scanline_2.4s_ease-in-out_infinite] bg-brand shadow-[0_0_12px_#1F5EFF]" />
                  <button type="button" onClick={() => { wantCam.current = false; setCamOn(false); }} className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-navy" aria-label={t('Couper la caméra')}><CameraOff className="h-4 w-4" aria-hidden /></button>
                </>
              )}

              {flash && (
                <div role="status" className="absolute inset-x-3 top-3 flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg">
                  <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> <span className="truncate">{t('Entrée validée')} : {flash.name}</span>
                </div>
              )}

              {result && (
                <div className={cx('absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-y-auto p-5 text-center text-white', result.ok ? 'bg-brand-dark/95' : result.reason === 'used' ? 'bg-amber-600/95' : 'bg-red-600/95')}>
                  {result.ok ? <ScanLine className="h-14 w-14" aria-hidden /> : <XCircle className="h-14 w-14" aria-hidden />}
                  <span className="text-2xl font-extrabold">{result.ok ? result.attendee.name : reasonText[result.reason]}</span>
                  {result.attendee && (
                    <span className="text-lg font-semibold">
                      {!result.ok && <>{result.attendee.name} · </>}{result.attendee.ticketType}
                    </span>
                  )}
                  {result.ok && result.attendee.seat && <span className="flex items-center gap-1.5 text-base font-semibold"><Armchair className="h-4 w-4" aria-hidden /> {t('Place {seat}', { seat: result.attendee.seat })}</span>}
                  {result.attendee?.sessionLabel && <span className="text-sm opacity-90">{/^\d{4}-\d{2}-\d{2}T/.test(result.attendee.sessionLabel) ? `${dateShort(result.attendee.sessionLabel, lang)} · ${time(result.attendee.sessionLabel, lang)}` : result.attendee.sessionLabel}</span>}
                  {!result.ok && result.reason === 'used' && result.attendee?.checkedInAt && <span className="text-sm">{t('Entré à {time}', { time: time(result.attendee.checkedInAt, lang) })}</span>}
                  {other && <span className="text-sm">{other}</span>}
                  {!result.ok && result.reason === 'unknown' && <span className="font-mono text-sm">{result.code}</span>}
                  {result.offline && <Badge className="!bg-white/20 !text-white">{t('Hors ligne')}</Badge>}
                  <div className="mt-3 flex w-full max-w-xs flex-col gap-2">
                    {result.ok ? (
                      <>
                        <Button size="lg" variant="light" className="w-full" onClick={confirmEntry} loading={busy} autoFocus>{t('Valider l’entrée')}</Button>
                        <button type="button" onClick={dismiss} disabled={busy} className="h-11 rounded-full text-sm font-semibold text-white/90 underline underline-offset-4">{t('Annuler')}</button>
                      </>
                    ) : (
                      <Button size="lg" variant="light" className="w-full" onClick={dismiss} autoFocus>{t('OK, scanner le suivant')}</Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <p className="sr-only" role="status" aria-live="assertive">
              {result && (result.ok ? `${t('Billet valide')} : ${result.attendee.name}` : `${reasonText[result.reason]}${result.attendee ? ` : ${result.attendee.name}` : ''}`)}
            </p>
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { void handle(manual, true); setManual(''); } }}>
              <div className="flex-1">
                <label htmlFor="manual-code" className="sr-only">{t('Code du billet')}</label>
                <Input id="manual-code" icon={<Keyboard className="h-4 w-4" />} placeholder={t('Saisir un code (E509-XXXX-XXXX)')} autoComplete="off" autoCapitalize="characters" value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} />
              </div>
              <Button type="submit" variant="dark" className="h-12">{t('Vérifier')}</Button>
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
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => (netOnline ? download().then(() => toast(t('Liste à jour'))).catch(() => toast(t('La mise à jour a échoué. Réessayez.'), 'error')) : toast(t('Connectez-vous à Internet pour mettre à jour la liste'), 'info'))}><RefreshCw className="h-4 w-4" aria-hidden /> {t('Mettre à jour')}</Button>
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
