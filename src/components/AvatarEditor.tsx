import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { useApp } from '@/store/app';
import { uploadFile } from '@/services/api';
import { shrinkImage } from '@/lib/image';
import { Avatar } from '@/components/ui';

/** Photo de profil : tout compte (participant, organisateur, administrateur) peut l'ajouter, la changer ou la retirer. */
export function AvatarEditor({ size = 64 }: { size?: number }) {
  const { user, updateUser, toast, t } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const onPick = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast(t('Choisissez une image JPG, PNG ou WebP'), 'error');
    if (f.size > 15 * 1024 * 1024) return toast(t('Image trop lourde : 15 Mo maximum'), 'error');
    setBusy(true);
    try {
      // Image réduite à 512 px : légère à envoyer et à afficher
      const { url } = await uploadFile('avatar', await shrinkImage(f, { maxSide: 512, type: 'image/jpeg', quality: 0.88 }), f.name);
      updateUser({ avatarUrl: url });
      toast(t('Photo de profil enregistrée'));
    } catch {
      toast(t('L’image n’a pas pu être envoyée. Vérifiez votre connexion et réessayez.'), 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={user.avatarUrl ? t('Changer la photo') : t('Ajouter une photo')}
        className="relative rounded-full"
      >
        <Avatar name={user.name} src={user.avatarUrl} size={size} />
        <span aria-hidden className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-brand text-white shadow-card ring-2 ring-surface">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        </span>
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onPick(e.target.files?.[0])} />
      {user.avatarUrl && (
        <button
          type="button"
          onClick={() => { updateUser({ avatarUrl: '' }); toast(t('Photo retirée')); }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink"
        >
          <Trash2 className="h-3 w-3" aria-hidden /> {t('Retirer la photo')}
        </button>
      )}
    </div>
  );
}
