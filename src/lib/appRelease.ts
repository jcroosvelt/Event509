/**
 * Application Android (APK) : le fichier et sa fiche de version sont dans le dépôt du site (public/app/), remplacés à chaque
 * nouvelle version par le workflow de l'application. Le site propose de l'installer et prévient les utilisateurs des mises à jour.
 */
import { inApp } from '@/lib/appBridge';

export interface AppRelease {
  versionCode: number;
  versionName: string;
  /** Taille du fichier en octets. */
  size: number;
  sha256: string;
  date: string;
  minAndroid: string;
  file: string;
}

export const APK_PATH = '/app/event509.apk';
/** Copie du fichier dans le dépôt public du site : même contenu, utilisable depuis l'application (adresse externe, ouverte dans le navigateur). */
export const APK_RAW_URL = 'https://raw.githubusercontent.com/jcroosvelt/event509/main/public/app/event509.apk';

/** Lit et vérifie la fiche de version ; null si elle est absente ou invalide (aucune invitation n'est alors affichée). */
export async function fetchRelease(): Promise<AppRelease | null> {
  try {
    const res = await fetch(`/app/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    const r = (await res.json()) as Partial<AppRelease>;
    if (!Number.isInteger(r.versionCode) || (r.versionCode ?? 0) <= 0 || typeof r.versionName !== 'string' || !(Number(r.size) > 0)) return null;
    return { versionCode: r.versionCode!, versionName: r.versionName, size: Number(r.size), sha256: String(r.sha256 ?? ''), date: String(r.date ?? ''), minAndroid: String(r.minAndroid ?? '7.0'), file: String(r.file ?? APK_PATH) };
  } catch {
    return null;
  }
}

/** Navigateur d'un téléphone Android (hors application) : seul cas où l'APK est proposé. */
export const isAndroidBrowser = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent) && !inApp();

/** Taille lisible : « 23 Mo ». */
export const sizeMo = (bytes: number) => `${Math.max(1, Math.round(bytes / 1048576))} Mo`;

/** Une version plus récente que celle installée existe-t-elle ? (installée = 0 : inconnue, pas de proposition) */
export const isNewer = (release: Pick<AppRelease, 'versionCode'>, installedBuild: number) => installedBuild > 0 && release.versionCode > installedBuild;

const KEY_LATER = 'e509.apk.later';
const KEY_DONE = 'e509.apk.done';
const LATER_DAYS = 3;

/** L'invitation est-elle à afficher ? Pas si l'utilisateur a dit « plus tard » récemment ou « déjà installée ». */
export function promptAllowed() {
  try {
    if (localStorage.getItem(KEY_DONE)) return false;
    const at = Number(localStorage.getItem(KEY_LATER));
    return !(at > 0 && Date.now() - at < LATER_DAYS * 86400000);
  } catch {
    return true;
  }
}
export function rememberLater() {
  try {
    localStorage.setItem(KEY_LATER, String(Date.now()));
  } catch {
    /* stockage indisponible */
  }
}
export function rememberInstalled() {
  try {
    localStorage.setItem(KEY_DONE, '1');
  } catch {
    /* stockage indisponible */
  }
}
