export const APP_ROLE: string;
export function appRolePassword(ownerPassword: string): string;
export function ensureAppRole(
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }> },
  databaseUrl: string,
  ownerRole?: string,
): Promise<{ applied: boolean; created?: boolean; reason?: string }>;
