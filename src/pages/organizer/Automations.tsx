import { useState } from 'react';
import { Bell, CalendarClock, CheckCircle2, Mail, MessageCircle, Pencil, RefreshCcw, Star } from 'lucide-react';
import { useApp } from '@/store/app';
import { Badge, Button, Card, Field, IconBadge, Input, Modal, PageHeader, Textarea, Toggle } from '@/components/ui';

interface Auto {
  id: string;
  name: string;
  trigger: string;
  icon: typeof Mail;
  tone: 'brand' | 'green' | 'orange' | 'violet' | 'amber';
  on: boolean;
  whatsapp: boolean;
  subject: string;
  body: string;
}

const initial: Auto[] = [
  { id: 'confirm', name: 'Confirmation de commande', trigger: 'Immédiatement après l’achat', icon: CheckCircle2, tone: 'green', on: true, whatsapp: true, subject: 'Vos billets pour {evenement}', body: 'Bonjour {prenom},\n\nMerci pour votre achat ! Vos billets sont en pièce jointe et dans l’app Event509.\n\nÀ bientôt !' },
  { id: 'remind7', name: 'Rappel J-7', trigger: '7 jours avant l’événement', icon: CalendarClock, tone: 'brand', on: true, whatsapp: false, subject: '{evenement} c’est dans une semaine !', body: 'Bonjour {prenom}, on se retrouve le {date} à {lieu}.' },
  { id: 'remind1', name: 'Rappel J-1', trigger: '24 h avant l’événement', icon: Bell, tone: 'orange', on: true, whatsapp: true, subject: 'C’est demain : {evenement}', body: 'Préparez votre QR code ! Ouverture des portes : {heure}.' },
  { id: 'update', name: 'Mise à jour de l’événement', trigger: 'Quand vous modifiez la date, l’heure ou le lieu', icon: RefreshCcw, tone: 'amber', on: true, whatsapp: true, subject: 'Changement : {evenement}', body: 'Bonjour {prenom}, une information importante concernant {evenement} : {details}' },
  { id: 'thanks', name: 'Remerciement & avis', trigger: 'Le lendemain de l’événement', icon: Star, tone: 'violet', on: false, whatsapp: false, subject: 'Merci d’être venu·e !', body: 'Merci {prenom} ! Donnez-nous votre avis en 30 secondes : {lien}' },
];

export default function Automations() {
  const { toast } = useApp();
  const [list, setList] = useState(initial);
  const [edit, setEdit] = useState<Auto | null>(null);
  const up = (id: string, p: Partial<Auto>) => setList((l) => l.map((a) => (a.id === id ? { ...a, ...p } : a)));

  return (
    <div>
      <PageHeader title="Emails automatiques" subtitle="Confirmation, rappels et mises à jour envoyés automatiquement à vos participants." />
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((a) => (
          <Card key={a.id} className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <IconBadge tone={a.tone}><a.icon className="h-[18px] w-[18px]" /></IconBadge>
              <div className="flex-1">
                <div className="font-bold">{a.name}</div>
                <div className="text-sm text-ink-muted">{a.trigger}</div>
              </div>
              <Toggle checked={a.on} onChange={(v) => up(a.id, { on: v })} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand"><Mail className="h-3 w-3" /> Email</Badge>
              {a.whatsapp && <Badge tone="green"><MessageCircle className="h-3 w-3" /> WhatsApp</Badge>}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEdit(a)}><Pencil className="h-4 w-4" /> Modifier</Button>
            </div>
          </Card>
        ))}
      </div>

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.name} size="lg" footer={<Button className="flex-1" onClick={() => { up(edit.id, edit); setEdit(null); toast('Modèle enregistré'); }}>Enregistrer</Button>}>
          <div className="space-y-4">
            <Field label="Objet"><Input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></Field>
            <Field label="Message" hint="Variables : {prenom} {evenement} {date} {heure} {lieu} {lien}"><Textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} className="min-h-[180px]" /></Field>
            <Toggle checked={edit.whatsapp} onChange={(v) => setEdit({ ...edit, whatsapp: v })} label="Envoyer aussi sur WhatsApp" />
            <Button variant="outline" size="sm" onClick={() => toast('Email de test envoyé', 'info')}>Envoyer un test</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
