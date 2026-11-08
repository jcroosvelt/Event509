import { useState } from 'react';
import { BadgeCheck, FileUp, Globe } from 'lucide-react';
import { useApp } from '@/store/app';
import { Avatar, Badge, Button, Card, Field, IconBadge, Input, PageHeader, Textarea, Toggle } from '@/components/ui';

export default function OrgSettings() {
  const { toast } = useApp();
  const [p, setP] = useState({ fb: '1234567890', ga: 'G-7Q2XKD91', showFollowers: true, showRemaining: true });

  return (
    <div className="max-w-3xl">
      <PageHeader title="Paramètres" subtitle="Profil public, vérification et outils de suivi." />
      <div className="space-y-4">
        <Card>
          <div className="mb-4 flex items-center gap-4">
            <Avatar name="LP" size={64} />
            <div className="flex-1">
              <div className="flex items-center gap-1 text-lg font-bold">Lakay Productions <BadgeCheck className="h-5 w-5 text-brand" /></div>
              <div className="text-sm text-ink-muted">event509.com/o/lakay-productions</div>
            </div>
            <Button variant="outline" size="sm">Changer le logo</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom public"><Input defaultValue="Lakay Productions" /></Field>
            <Field label="Ville"><Input defaultValue="Pétion-Ville" /></Field>
            <Field label="Site web"><Input defaultValue="https://lakay.ht" /></Field>
            <Field label="Instagram"><Input defaultValue="@lakayprod" /></Field>
            <Field label="Bio" className="sm:col-span-2"><Textarea defaultValue="Concerts, festivals et soirées depuis 2012." /></Field>
          </div>
          <div className="mt-4 space-y-3">
            <Toggle checked={p.showFollowers} onChange={(v) => setP({ ...p, showFollowers: v })} label="Afficher le nombre d’abonnés" />
            <Toggle checked={p.showRemaining} onChange={(v) => setP({ ...p, showRemaining: v })} label="Afficher les places restantes" description="Crée un sentiment d’urgence quand il reste peu de billets" />
          </div>
          <Button className="mt-4" onClick={() => toast('Profil enregistré')}>Enregistrer</Button>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-3">
            <IconBadge tone="green"><BadgeCheck className="h-[18px] w-[18px]" /></IconBadge>
            <div className="flex-1"><div className="font-bold">Vérification de l’organisateur</div><div className="text-sm text-ink-muted">Badge vérifié, publication instantanée, versements plus rapides</div></div>
            <Badge tone="green">Vérifié</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {['Pièce d’identité', 'Patente / NIF', 'Justificatif bancaire'].map((d) => (
              <div key={d} className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700"><FileUp className="h-4 w-4" /> {d} ✓</div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-3">
            <IconBadge><Globe className="h-[18px] w-[18px]" /></IconBadge>
            <div><div className="font-bold">Pixels de suivi par défaut</div><div className="text-sm text-ink-muted">Appliqués à toutes vos pages événement</div></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Facebook Pixel ID"><Input value={p.fb} onChange={(e) => setP({ ...p, fb: e.target.value })} /></Field>
            <Field label="Google Analytics (GA4)"><Input value={p.ga} onChange={(e) => setP({ ...p, ga: e.target.value })} /></Field>
          </div>
          <p className="mt-3 text-xs text-ink-muted">Événements envoyés : PageView, ViewContent, InitiateCheckout, Purchase (avec montant et devise).</p>
          <Button className="mt-4" variant="dark" onClick={() => toast('Pixels enregistrés')}>Enregistrer</Button>
        </Card>
      </div>
    </div>
  );
}
