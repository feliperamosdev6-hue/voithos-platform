import fs from 'fs/promises';
import path from 'path';

type OperationalEvent = {
  id: string;
  createdAt: string;
  eventType: string;
  clinicId?: string | null;
  instanceId?: string | null;
  phone?: string | null;
  status?: string | null;
  messageJobId?: string | null;
  appointmentId?: string | null;
  outboundMessageId?: string | null;
  summary?: string | null;
  payload?: Record<string, unknown> | null;
};

const runtimeDir = path.resolve(process.cwd(), '.runtime');
const eventsFile = path.join(runtimeDir, 'operational-events.jsonl');
const MAX_EVENT_LINES = 4000;

const safeString = (value: unknown): string => String(value || '').trim();

const redactLinks = (value: unknown): string => safeString(value).replace(/https?:\/\/\S+/gi, '[LINK_REDACTED]');

const ensureRuntimeDir = async (): Promise<void> => {
  await fs.mkdir(runtimeDir, { recursive: true });
};

const readLines = async (): Promise<string[]> => {
  await ensureRuntimeDir();
  const content = await fs.readFile(eventsFile, 'utf8').catch(() => '');
  return content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
};

const writeLines = async (lines: string[]): Promise<void> => {
  await ensureRuntimeDir();
  await fs.writeFile(eventsFile, `${lines.join('\n')}\n`, 'utf8');
};

export const createBodySummary = (body: unknown): { preview: string; containsLinks: boolean; length: number } => {
  const raw = safeString(body);
  return {
    preview: redactLinks(raw).slice(0, 240),
    containsLinks: /https?:\/\/\S+/i.test(raw),
    length: raw.length,
  };
};

export const operationalEventRepository = {
  append: async (payload: Omit<OperationalEvent, 'id' | 'createdAt'>): Promise<OperationalEvent> => {
    const event: OperationalEvent = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date().toISOString(),
      eventType: safeString(payload.eventType) || 'UNKNOWN_EVENT',
      clinicId: safeString(payload.clinicId) || null,
      instanceId: safeString(payload.instanceId) || null,
      phone: safeString(payload.phone) || null,
      status: safeString(payload.status) || null,
      messageJobId: safeString(payload.messageJobId) || null,
      appointmentId: safeString(payload.appointmentId) || null,
      outboundMessageId: safeString(payload.outboundMessageId) || null,
      summary: redactLinks(payload.summary || '').slice(0, 400) || null,
      payload: payload.payload || null,
    };

    const lines = await readLines();
    lines.push(JSON.stringify(event));
    while (lines.length > MAX_EVENT_LINES) lines.shift();
    await writeLines(lines);
    return event;
  },

  listRecent: async (filters: {
    clinicId?: string;
    instanceId?: string;
    eventType?: string;
    search?: string;
    limit?: number;
    offset?: number;
    auditOnly?: boolean;
  } = {}): Promise<OperationalEvent[]> => {
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 500);
    const offset = Math.max(Number(filters.offset) || 0, 0);
    const search = safeString(filters.search).toLowerCase();
    const lines = await readLines();

    const items = lines
      .map((line) => {
        try {
          return JSON.parse(line) as OperationalEvent;
        } catch (_error) {
          return null;
        }
      })
      .filter((item): item is OperationalEvent => Boolean(item))
      .filter((item) => !filters.clinicId || item?.clinicId === filters.clinicId)
      .filter((item) => !filters.instanceId || item?.instanceId === filters.instanceId)
      .filter((item) => !filters.eventType || item?.eventType === filters.eventType)
      .filter((item) => !filters.auditOnly || String(item?.eventType || '').toUpperCase().startsWith('ADMIN_'))
      .filter((item) => {
        if (!search) return true;
        const haystack = [
          item?.eventType,
          item?.clinicId,
          item?.instanceId,
          item?.phone,
          item?.status,
          item?.summary,
          JSON.stringify(item?.payload || {}),
        ].join(' ').toLowerCase();
        return haystack.includes(search);
      })
      .reverse();

    return items.slice(offset, offset + limit);
  },

  pruneBefore: async (cutoff: Date): Promise<number> => {
    const cutoffMs = cutoff.getTime();
    const lines = await readLines();
    const keptLines = lines.filter((line) => {
      try {
        const item = JSON.parse(line) as OperationalEvent;
        const timestamp = new Date(String(item?.createdAt || '')).getTime();
        return Number.isNaN(timestamp) || timestamp >= cutoffMs;
      } catch (_error) {
        return false;
      }
    });

    const removed = Math.max(0, lines.length - keptLines.length);
    if (removed > 0) {
      await writeLines(keptLines);
    }
    return removed;
  },
};
