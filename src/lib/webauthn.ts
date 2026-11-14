import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';

/** Passkeys (WebAuthn) : le navigateur fait la cérémonie ; le serveur vérifie tout. */
export const passkeysSupported = () => typeof window !== 'undefined' && browserSupportsWebAuthn();

export async function createPasskey(optionsJSON: unknown) {
  return startRegistration({ optionsJSON: optionsJSON as Parameters<typeof startRegistration>[0]['optionsJSON'] });
}
export async function getPasskeyAssertion(optionsJSON: unknown) {
  return startAuthentication({ optionsJSON: optionsJSON as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
}
/** L'utilisateur a fermé la fenêtre de l'appareil : ce n'est pas une erreur à signaler. */
export const passkeyCancelled = (e: unknown) => (e as { name?: string })?.name === 'NotAllowedError' || (e as { name?: string })?.name === 'AbortError';
