import { DEMO, http } from './api';
import { blobToBase64, shrinkImage } from '@/lib/image';

/** Réseau social : abonnements, commentaires, messages privés. Pas en démonstration (aucun serveur). */
export const socialAvailable = !DEMO;

export interface CommentAuthor { name: string; avatarUrl?: string; isOrganizer: boolean; verified: boolean }
/** Média d'un commentaire ou d'une publication : photo, GIF, vidéo ou autocollant (émoji). */
export interface PostMedia { id: string; kind: 'image' | 'gif' | 'video' | 'sticker'; url?: string; sticker?: string; duration?: number }
export interface EventComment {
  id: string; eventId: string; parentId: string | null; body: string; style?: string; media?: PostMedia[]; createdAt: string; author: CommentAuthor; mine: boolean; canDelete: boolean; likes?: number; liked?: boolean;
  replies?: EventComment[];
}
export interface CommentList { total: number; hasMore: boolean; enabled?: boolean; items: EventComment[] }

export const followOrganizerApi = (id: string, on: boolean) =>
  http<{ following: boolean; followers: number }>(`/orgs/${encodeURIComponent(id)}/follow`, { method: on ? 'POST' : 'DELETE', ...(on ? { body: '{}' } : {}) });
export const fetchMyFollows = () => http<string[]>('/me/follows');

export const listComments = (eventId: string, before?: string) =>
  http<CommentList>(`/events/${encodeURIComponent(eventId)}/comments${before ? `?before=${encodeURIComponent(before)}` : ''}`);
export type MediaIn = { fileId: string; duration?: number } | { kind: 'sticker'; sticker: string };
export const postComment = (eventId: string, body: string, parentId?: string, media?: MediaIn[], style?: string) =>
  http<EventComment>(`/events/${encodeURIComponent(eventId)}/comments`, { method: 'POST', body: JSON.stringify({ body, parentId, style, media: media?.length ? media : undefined }) });

const CHUNK = 3 * 1024 * 1024;
/** Envoie une photo, un GIF ou une vidéo (morceaux de 3 Mo, assemblés par le serveur) ; les photos sont réduites avant l'envoi. */
export async function uploadMedia(file: File): Promise<{ fileId: string; kind: 'image' | 'gif' | 'video' }> {
  let blob: Blob = file;
  const isVideo = file.type.startsWith('video/');
  const isGif = file.type === 'image/gif';
  if (!isVideo && !isGif) blob = await shrinkImage(file, { maxSide: 1600, type: 'image/jpeg', quality: 0.85 });
  const id = `w${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
  const total = Math.max(1, Math.ceil(blob.size / CHUNK));
  for (let i = 0; i < total; i++) {
    const r = await http<{ done: boolean; fileId?: string; kind?: 'image' | 'gif' | 'video' }>('/media/upload', {
      method: 'POST',
      body: JSON.stringify({ uploadId: id, index: i, total, data: await blobToBase64(blob.slice(i * CHUNK, (i + 1) * CHUNK)), name: file.name }),
    });
    if (r.done && r.fileId) return { fileId: r.fileId, kind: r.kind ?? 'image' };
  }
  throw new Error('envoi incomplet');
}
export const likeComment = (id: string, on: boolean) => http<{ liked: boolean; likes: number }>(`/comments/${encodeURIComponent(id)}/like`, { method: on ? 'POST' : 'DELETE', ...(on ? { body: '{}' } : {}) });
export const deleteComment = (id: string) => http<null>(`/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });

export interface ConversationItem {
  id: string; at: string; unread: number; event?: string; last: { body: string; from: 'user' | 'org' } | null;
  organizer?: { id: string; name: string; logo?: string; verified: boolean };
  from?: string; blocked?: boolean;
}
export interface Thread {
  id: string; messages: { id: string; from: 'user' | 'org'; body: string; at: string }[];
  organizer?: { id: string; name: string; logo?: string; verified: boolean };
  from?: string; avatarUrl?: string; blocked?: boolean;
}
export const startConversation = (organizerId: string, body: string, eventId?: string) =>
  http<{ id: string }>('/messages', { method: 'POST', body: JSON.stringify({ organizerId, body, eventId }) });
export const myConversations = () => http<ConversationItem[]>('/me/conversations');
export const myThread = (id: string) => http<Thread>(`/me/conversations/${encodeURIComponent(id)}`);
export const replyMine = (id: string, body: string) => http<{ id: string }>(`/me/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
export const orgConversations = () => http<ConversationItem[]>('/org/conversations');
export const orgThread = (id: string) => http<Thread>(`/org/conversations/${encodeURIComponent(id)}`);
export const replyOrg = (id: string, body: string) => http<{ id: string }>(`/org/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
export const unreadMessages = () => http<{ inbox: number; organizer: number }>('/me/unread-messages');
