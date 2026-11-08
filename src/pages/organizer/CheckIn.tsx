import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, CheckCircle2, CloudOff, CloudUpload, Keyboard, RefreshCw, ScanLine, Wifi, XCircle } from 'lucide-react';
import { listAttendees, verifyTicket } from '@/services/api';
import { useApp } from '@/store/app';
import { useOnline } from '@/lib/hooks';
import { cx, time } from '@/lib/format';
import { Badge, Button, Card, Input, PageHeader, ProgressRing, Select, Toggle } from '@/components/ui';
import type { Attendee } from '@/types';

type Result =
  | { ok: true; attendee: Attendee; offline: boolean }
  | { ok: false; reason: 'unknown' | 'used'; attendee?: Attendee; code: string; offline: boolean };

const CACHE = 'e509.checkin.list';

function readCache(): Attendee[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? '[]');
  } catch {
    return [];
  }
}
function writeCache(list: Attendee[]) {
  try {
    localStorage.setItem(CACHE, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

declare global {
  interface Window {
    BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
  }
}

export default function CheckIn() {
  const { offlineScans, setOfflineScans, toast, lang } = useApp();
  const netOnline = useOnline();
  const [forceOffline, setForceOffline] = useState(false);
  const online = netOnline && !forceOffline;
  const [list, setList] = useState<Attendee[]>(readCache);
  const [syncedAt, setSyncedAt] = useState<string | null>(() => localStorage.getItem(CACHE + '.at'));
  const [result, setResult] = useState<Result | null>(null);
  const [manual, setManual] = useState('');
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState('');
  const [history, setHistory] = useState<Result[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastCode = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const download = useCallback(async () => {
    const l = await listAttendees();
    // conserver les check-ins locaux non synchronisés
    const local = new Map(readCache().filter((a) => a.checkedIn).map((a) => [a.code, a]));
    const merged = l.map((a) => (local.has(a.code) && !a.checkedIn ? { ...a, checkedIn: true, checkedInAt: local.get(a.code)!.checkedInAt } : a));
    setList(merged);
    writeCache(merged);
    const at = new Date().toISOString();
    localStorage.setItem(CACHE + '.at', at);
    setSyncedAt(at);
  }, []);

  useEffect(() => {
    if (!list.length && netOnline) download();
  }, [list.length, netOnline, download]);

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
        const v = await verifyTicket(code);
        if (v.ok) r = { ok: true, attendee: v.attendee, offline: false };
        else if (local?.checkedIn) r = { ok: false, reason: 'used', attendee: local, code, offline: false };
        else r = { ok: false, reason: v.reason, attendee: v.reason === 'used' ? v.attendee : undefined, code, offline: false };
      } else {
        if (!local) r = { ok: false, reason: 'unknown', code, offline: true };
        else if (local.checkedIn) r = { ok: false, reason: 'used', attendee: local, code, offline: true };
        else {
          r = { ok: true, attendee: { ...local, checkedIn: true, checkedInAt: new Date().toISOString() }, offline: true };
          setOfflineScans((s) => [...s, { code, at: new Date().toISOString(), synced: false }]);
        }
      }
      if (r.ok) {
        const upd = list.map((a) => (a.code === code ? { ...a, checkedIn: true, checkedInAt: r.attendee!.checkedInAt } : a));
        setList(upd);
        writeCache(upd);
      }
      navigator.vibrate?.(r.ok ? 80 : [60, 60, 60]);
      setResult(r);
      setHistory((h) => [r, ...h].slice(0, 20));
    },
    [list, online, setOfflineScans],
  );

  // Caméra
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
              /* image non lisible */
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setCamErr('Accès à la caméra refusé ou indisponible. Utilisez la saisie manuelle.');
        setCamOn(false);
      }
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camOn, handle]);

  const sync = async () => {
    const pending = offlineScans.filter((s) => !s.synced);
    for (const s of pending) await verifyTicket(s.code);
    setOfflineScans((all) => all.map((s) => ({ ...s, synced: true })));
    await download();
    toast(`${pending.length} scan(s) synchronisé(s)`);
  };

  const pending = offlineScans.filter((s) => !s.synced).length;
  const inCount = list.filter((a) => a.checkedIn).length;
  const demo = (kind: 'valid' | 'used' | 'fake') => {
    const pick = kind === 'valid' ? list.find((a) => !a.checkedIn) : list.find((a) => a.checkedIn);
    handle(kind === 'fake' ? 'E509-FAKE-0000' : pick?.code ?? 'E509-NONE-0000');
  };

  return (
    <div>
      <PageHeader title="Check-in" subtitle="Scannez les QR codes à l’entrée. Chaque billet n’est valide qu’une seule fois." />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {/* État réseau */}
          <Card className={cx('flex flex-wrap items-center gap-4', !online && 'bg-amber-50')}>
            <span className={cx('grid h-11 w-11 place-items-center rounded-full', online ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-100 text-amber-700')}>
              {online ? <Wifi className="h-5 w-5" /> : <CloudOff className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-bold">{online ? 'En ligne' : 'Mode hors ligne'}</div>
              <div className="text-xs text-ink-soft">
                {online ? 'Validation en temps réel sur le serveur.' : 'Validation sur la liste téléchargée. Les scans seront synchronisés au retour du réseau.'}
                {syncedAt && <> · Liste du {time(syncedAt, lang)}</>}
              </div>
            </div>
            <div className="w-full border-t border-ink/5 pt-3 sm:w-auto sm:border-0 sm:pt-0"><Toggle checked={forceOffline} onChange={setForceOffline} label="Forcer hors ligne" /></div>
          </Card>

          {/* Scanner */}
          <Card className="p-3">
            <div className="relative aspect-square overflow-hidden rounded-3xl bg-ink sm:aspect-video">
              <video ref={videoRef} className={cx('h-full w-full object-cover', !camOn && 'hidden')} playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              {!camOn && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
                  <div>
                    <ScanLine className="mx-auto h-14 w-14 text-brand-300" />
                    <p className="mt-3 text-sm text-white/70">{camErr || 'Activez la caméra pour scanner les billets.'}</p>
                    <Button className="mt-4" onClick={() => { setCamErr(''); setCamOn(true); }}><Camera className="h-4 w-4" /> Activer la caméra</Button>
                  </div>
                </div>
              )}
              {camOn && (
                <>
                  <div className="pointer-events-none absolute inset-[12%] rounded-3xl border-4 border-white/80" />
                  <div className="pointer-events-none absolute inset-x-[12%] h-0.5 animate-[scanline_2.4s_ease-in-out_infinite] bg-brand shadow-[0_0_12px_#1F5EFF]" />
                  <button onClick={() => setCamOn(false)} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/90" aria-label="Couper la caméra"><CameraOff className="h-4 w-4" /></button>
                </>
              )}

              {/* Résultat */}
              {result && (
                <button
                  onClick={() => setResult(null)}
                  className={cx('absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white', result.ok ? 'bg-emerald-600/95' : result.reason === 'used' ? 'bg-amber-500/95' : 'bg-red-600/95')}
                >
                  {result.ok ? <CheckCircle2 className="h-20 w-20" /> : <XCircle className="h-20 w-20" />}
                  <div className="text-2xl font-extrabold">{result.ok ? 'Entrée validée' : result.reason === 'used' ? 'Déjà scanné' : 'Billet invalide'}</div>
                  {result.attendee && <div className="text-lg font-semibold">{result.attendee.name} · {result.attendee.ticketType}</div>}
                  {!result.ok && result.reason === 'used' && result.attendee?.checkedInAt && <div className="text-sm">Entré à {time(result.attendee.checkedInAt, lang)}</div>}
                  {!result.ok && result.reason === 'unknown' && <div className="font-mono text-sm">{result.code}</div>}
                  {result.offline && <Badge className="bg-white/20 text-white">Hors ligne</Badge>}
                  <span className="mt-2 text-xs opacity-80">Touchez pour scanner le suivant</span>
                </button>
              )}
            </div>

            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); handle(manual); setManual(''); }}>
              <div className="flex-1"><Input icon={<Keyboard className="h-4 w-4" />} placeholder="Saisir un code (E509-XXXX-XXXX)" value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} /></div>
              <Button type="submit" variant="dark" className="h-12" disabled={!manual}>Valider</Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="self-center text-ink-muted">Démo :</span>
              <Button size="sm" variant="soft" onClick={() => demo('valid')}>Billet valide</Button>
              <Button size="sm" variant="soft" onClick={() => demo('used')}>Billet déjà utilisé</Button>
              <Button size="sm" variant="soft" onClick={() => demo('fake')}>Faux billet</Button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="flex items-center gap-5">
            <ProgressRing value={list.length ? inCount / list.length : 0} size={96} stroke={10} track="#F1F3F8">
              <div><div className="text-xl font-extrabold">{list.length ? Math.round((inCount / list.length) * 100) : 0}%</div></div>
            </ProgressRing>
            <div>
              <div className="text-3xl font-extrabold">{inCount}<span className="text-base font-medium text-ink-muted"> / {list.length}</span></div>
              <div className="text-sm text-ink-soft">participants entrés</div>
            </div>
          </Card>

          <Card>
            <Select className="mb-3"><option>Festival Kompa Live 2026</option><option>Tournoi des Quartiers — Finale</option></Select>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={download} disabled={!netOnline}><RefreshCw className="h-4 w-4" /> Télécharger la liste</Button>
              <Button className="flex-1" onClick={sync} disabled={!pending || !online}><CloudUpload className="h-4 w-4" /> Sync ({pending})</Button>
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 font-bold">Derniers scans</h3>
            {!history.length && <p className="text-sm text-ink-muted">Aucun scan pour l’instant.</p>}
            <ul className="space-y-2">
              {history.map((h, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className={cx('h-2.5 w-2.5 rounded-full', h.ok ? 'bg-emerald-500' : !h.ok && h.reason === 'used' ? 'bg-amber-500' : 'bg-red-500')} />
                  <span className="flex-1 truncate font-medium">{h.attendee?.name ?? (!h.ok ? h.code : '')}</span>
                  <span className="text-xs text-ink-muted">{h.ok ? 'Validé' : h.reason === 'used' ? 'Doublon' : 'Inconnu'}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
