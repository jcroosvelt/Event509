import { DEMO, http } from './api';
import type { EventItem } from '@/types';

/** Vie de la communauté : fil, photos, « Je participe », liste d'attente, signalements, blocages (pas en démonstration : aucun serveur). */
export const communityAvailable = !DEMO;

export interface Person { name: string; avatarUrl?: string }
export interface GoingState { count: number; me: boolean; people: Person[] }
export const getGoing = (eventId: string) => http<GoingState>(`/events/${encodeURIComponent(eventId)}/going`);
export const setGoing = (eventId: string, on: boolean) => http<GoingState>(`/events/${encodeURIComponent(eventId)}/going`, { method: on ? 'POST' : 'DELETE', ...(on ? { body: '{}' } : {}) });

export interface EventPhoto { id: string; eventId: string; url: string; caption?: string; createdAt: string; author: Person; mine: boolean; canDelete: boolean }
export interface PhotoList { total: number; hasMore: boolean; canAdd: boolean; ended: boolean; items: EventPhoto[] }
export const listPhotos = (eventId: string, before?: string) => http<PhotoList>(`/events/${encodeURIComponent(eventId)}/photos${before ? `?before=${encodeURIComponent(before)}` : ''}`);
export const deletePhoto = (id: string) => http<null>(`/photos/${encodeURIComponent(id)}`, { method: 'DELETE' });
export async function addPhoto(eventId: string, blob: Blob, name: string, caption?: string): Promise<EventPhoto> {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Lecture impossible'));
    r.readAsDataURL(blob);
  });
  return http<EventPhoto>(`/events/${encodeURIComponent(eventId)}/photos`, { method: 'POST', body: JSON.stringify({ data, name, caption }) });
}

export interface WaitEntry { ticketTypeId: string; qty: number }
export const myWaitlist = (eventId: string) => http<WaitEntry[]>(`/events/${encodeURIComponent(eventId)}/waitlist`);
export const joinWaitlist = (eventId: string, ticketTypeId: string, qty = 1) => http<WaitEntry & { position: number }>(`/events/${encodeURIComponent(eventId)}/waitlist`, { method: 'POST', body: JSON.stringify({ ticketTypeId, qty }) });
export const leaveWaitlist = (eventId: string, ticketTypeId: string) => http<null>(`/events/${encodeURIComponent(eventId)}/waitlist?ticketTypeId=${encodeURIComponent(ticketTypeId)}`, { method: 'DELETE' });

export type ReportKind = 'comment' | 'photo' | 'message';
export const REPORT_REASONS = ['spam', 'abuse', 'inappropriate', 'scam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const reportContent = (kind: ReportKind, targetId: string, reason: ReportReason, note?: string) =>
  http<{ reported: boolean }>('/reports/content', { method: 'POST', body: JSON.stringify({ kind, targetId, reason, note }) });
export const blockAuthor = (kind: 'comment' | 'photo', id: string) => http<{ blocked: boolean; name: string }>(`/${kind === 'comment' ? 'comments' : 'photos'}/${encodeURIComponent(id)}/block`, { method: 'POST', body: '{}' });
export const myBlocks = () => http<{ id: string; name: string; avatarUrl?: string }[]>('/me/blocks');
export const unblock = (id: string) => http<null>(`/me/blocks/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const blockConversationUser = (conversationId: string, on: boolean) => http<{ blocked: boolean }>(`/org/conversations/${encodeURIComponent(conversationId)}/block`, { method: 'POST', body: JSON.stringify({ on }) });

export interface AdminContentReport { id: string; kind: ReportKind; targetId: string; reason: ReportReason; note?: string; status: 'open' | 'removed' | 'dismissed'; createdAt: string; reporter: string; reports: number; snapshot: Record<string, unknown> }
export const adminContentReports = (status: 'open' | 'removed' | 'dismissed' = 'open') => http<AdminContentReport[]>(`/admin/content-reports?status=${status}`);
export const decideContentReport = (id: string, action: 'remove' | 'dismiss') => http<null>(`/admin/content-reports/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ action }) });

export type FeedItem =
  | { type: 'event'; at: string; event: EventItem }
  | { type: 'photos'; at: string; event: { id: string; slug: string; title: string }; count: number; thumbs: string[] };
export const getFeed = (before?: string) => http<{ items: FeedItem[]; hasMore: boolean }>(`/me/feed${before ? `?before=${encodeURIComponent(before)}` : ''}`);
