/** Mention « Powered by JC Multimedia » (le nom est une marque : le texte est le même dans toutes les langues). */
export function PoweredBy({ className }: { className?: string }) {
  return (
    <p className={className ?? 'text-center text-xs text-ink-muted'}>
      Powered by{' '}
      <a href="https://jcmultimedia.online" target="_blank" rel="noopener noreferrer" className="font-semibold text-ink-soft hover:text-ink hover:underline">JC Multimedia</a>
    </p>
  );
}
