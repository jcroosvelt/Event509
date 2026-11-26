import { DEMO, http } from './api';

/** Réseau social : abonnements, commentaires, messages privés. Pas en démonstration (aucun serveur). */
export const socialAvailable = !DEMO;

export interface CommentAuthor { name: string; avatarUrl?: string; isOrganizer: boolean; verified: boolean }
export interface EventComment {
  id: string; eventId: string; parentId: string | null; body: string; createdAt: string; author: CommentAuthor; mine: boolean; canDelete: boolean;
  replies?: EventComment[];
}
export interface CommentList { total: number; hasMore: boolean; items: EventComment[] }

export const followOrganizerApi = (id: string, on: boolean) =>
  http<{ following: boolean; followers: number }>(`/orgs/${encodeURIComponent(id)}/follow`, { method: on ? 'POST' : 'DELETE', ...(on ? { body: '{}' } : {}) });
export const fetchMyFollows = () => http<string[]>('/me/follows');

export const listComments = (eventId: string, before?: string) =>
  http<CommentList>(`/events/${encodeURIComponent(eventId)}/comments${before ? `?before=${encodeURIComponent(before)}` : ''}`);
export const postComment = (eventId: string, body: string, parentId?: string) =>
  http<EventComment>(`/events/${encodeURIComponent(eventId)}/comments`, { method: 'POST', body: JSON.stringify({ body, parentId }) });
export const deleteComment = (id: string) => http<null>(`/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });

export interface ConversationItem {
  id: string; at: string; unread: number; event?: string; last: { body: string; from: 'user' | 'org' } | null;
  organizer?: { id: string; name: string; logo?: string; verified: boolean };
  from?: string;
}
export interface Thread {
  id: string; messages: { id: string; from: 'user' | 'org'; body: string; at: string }[];
  organizer?: { id: string; name: string; logo?: string; verified: boolean };
  from?: string; avatarUrl?: string;
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
