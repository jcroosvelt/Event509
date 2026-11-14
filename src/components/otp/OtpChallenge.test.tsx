import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppProvider } from '@/store/app';
import { ApiError } from '@/lib/errors';
import { OtpChallenge, otpErrorMessage } from './OtpChallenge';

const wrap = (ui: React.ReactElement) => render(<AppProvider>{ui}</AppProvider>);
const sent = () => Promise.resolve({ sent: true as const, expiresInSeconds: 300, requestsLeft: 2 });

describe('OtpChallenge', () => {
  it('affiche le compte à rebours de 5 minutes après l’envoi', async () => {
    wrap(<OtpChallenge send={sent} verify={async () => undefined} onVerified={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Recevoir le code|Get the code/ }));
    expect(await screen.findByText(/(Expire dans|Expires in) (5:00|4:5\d)/)).toBeTruthy();
    expect(screen.getByText(/2 (restant|left)/)).toBeTruthy();
  });

  it('ne se dit « confirmé » que si le serveur accepte le code', async () => {
    const onVerified = vi.fn();
    const verify = vi.fn().mockRejectedValueOnce(new ApiError(400, 'x', undefined, 'otp_invalid')).mockResolvedValueOnce(undefined);
    wrap(<OtpChallenge send={sent} verify={verify} onVerified={onVerified} />);
    fireEvent.click(screen.getByRole('button', { name: /Recevoir le code|Get the code/ }));
    const input = await screen.findByLabelText(/Code reçu|Code received/);
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmer le code|Confirm the code/ }));
    expect(await screen.findByText(/Code incorrect|Wrong code/)).toBeTruthy();
    expect(onVerified).not.toHaveBeenCalled();
    expect(screen.queryByText(/Numéro confirmé|Number confirmed/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer le code|Confirm the code/ }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledOnce());
    expect(screen.getByText(/Numéro confirmé|Number confirmed/)).toBeTruthy();
  });

  it('n’accepte que des chiffres, 6 au plus, et bloque le bouton tant que le code est incomplet', async () => {
    wrap(<OtpChallenge send={sent} verify={async () => undefined} onVerified={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Recevoir le code|Get the code/ }));
    const input = (await screen.findByLabelText(/Code reçu|Code received/)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12ab34567890' } });
    expect(input.value).toBe('123456');
    fireEvent.change(input, { target: { value: '12' } });
    expect((screen.getByRole('button', { name: /Confirmer le code|Confirm the code/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('affiche la limite quotidienne et l’échec d’envoi, et propose le renvoi', async () => {
    const send = vi.fn().mockRejectedValueOnce(new ApiError(429, 'x', undefined, 'otp_limit')).mockRejectedValueOnce(new ApiError(503, 'x', undefined, 'otp_temporary')).mockImplementation(sent);
    wrap(<OtpChallenge send={send} verify={async () => undefined} onVerified={() => undefined} />);
    const btn = screen.getByRole('button', { name: /Recevoir le code|Get the code/ });
    fireEvent.click(btn);
    expect(await screen.findByText(/3 codes (par|per) 24/)).toBeTruthy();
    fireEvent.click(btn);
    expect(await screen.findByText(/envoi du code a échoué|Sending the code failed/i)).toBeTruthy();
    fireEvent.click(btn);
    expect(await screen.findByRole('button', { name: /Renvoyer un code|Resend a code/ })).toBeTruthy();
  });

  it('messages pour chaque erreur du serveur', () => {
    const t = (s: string) => s;
    for (const code of ['otp_invalid', 'otp_expired', 'otp_locked', 'otp_limit', 'phone_invalid', 'otp_unreachable', 'otp_temporary'])
      expect(otpErrorMessage(new ApiError(400, 'x', undefined, code), t)).toBeTruthy();
    expect(otpErrorMessage(new ApiError(0, 'x'), t)).toMatch(/Réseau/);
  });
});
