import { describe, expect, it } from 'vitest';
import { buildMessage } from '../../api/_lib/push';

describe('notifications push', () => {
  it('construit un message FCM v1 avec le canal et l’adresse à ouvrir', () => {
    const m = buildMessage('tok', { title: 'Rappel', body: 'Demain', url: '/e/x', channel: 'reminders' });
    expect(m.message.token).toBe('tok');
    expect(m.message.notification).toEqual({ title: 'Rappel', body: 'Demain' });
    expect(m.message.data).toEqual({ url: '/e/x', channel: 'reminders' });
    expect(m.message.android.notification.channel_id).toBe('reminders');
    expect(m.message.android.priority).toBe('HIGH');
  });
});
