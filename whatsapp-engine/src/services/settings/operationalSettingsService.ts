import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';

export type EditableOperationalSettings = {
  maintenanceCleanupIntervalMs: number;
  retentionMessageJobsDays: number;
  retentionMessageLogsDays: number;
  retentionOperationalEventsDays: number;
  clinicSlaWarningRatePct: number;
  clinicSlaCriticalRatePct: number;
  syntheticMonitorIntervalMs: number;
  syntheticAlertCooldownMs: number;
};

type SettingsSnapshot = {
  defaults: EditableOperationalSettings;
  overrides: Partial<EditableOperationalSettings>;
  effective: EditableOperationalSettings;
};

const runtimeDir = path.resolve(process.cwd(), '.runtime');
const settingsFile = path.join(runtimeDir, 'operational-settings.json');

const buildDefaults = (): EditableOperationalSettings => ({
  maintenanceCleanupIntervalMs: env.maintenanceCleanupIntervalMs,
  retentionMessageJobsDays: env.retentionMessageJobsDays,
  retentionMessageLogsDays: env.retentionMessageLogsDays,
  retentionOperationalEventsDays: env.retentionOperationalEventsDays,
  clinicSlaWarningRatePct: env.clinicSlaWarningRatePct,
  clinicSlaCriticalRatePct: env.clinicSlaCriticalRatePct,
  syntheticMonitorIntervalMs: env.syntheticMonitorIntervalMs,
  syntheticAlertCooldownMs: env.syntheticAlertCooldownMs,
});

const sanitizeNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
};

const sanitizeOverrides = (payload: Record<string, unknown> | null | undefined): Partial<EditableOperationalSettings> => {
  const source = payload || {};
  const sanitized: Partial<EditableOperationalSettings> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null || value === '') continue;
    if (!(key in buildDefaults())) continue;
    sanitized[key as keyof EditableOperationalSettings] = sanitizeNumber(value, 0);
  }
  return sanitized;
};

const ensureRuntimeDir = (): void => {
  fs.mkdirSync(runtimeDir, { recursive: true });
};

const loadOverridesSync = (): Partial<EditableOperationalSettings> => {
  try {
    if (!fs.existsSync(settingsFile)) return {};
    const raw = fs.readFileSync(settingsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return sanitizeOverrides(parsed?.overrides || parsed || {});
  } catch {
    return {};
  }
};

let overrides: Partial<EditableOperationalSettings> = loadOverridesSync();

const persistOverrides = (): void => {
  ensureRuntimeDir();
  fs.writeFileSync(
    settingsFile,
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      overrides,
    }, null, 2),
    'utf8',
  );
};

const buildEffective = (): EditableOperationalSettings => ({
  ...buildDefaults(),
  ...overrides,
});

export const operationalSettingsService = {
  getSnapshot(): SettingsSnapshot {
    const defaults = buildDefaults();
    return {
      defaults,
      overrides: { ...overrides },
      effective: {
        ...defaults,
        ...overrides,
      },
    };
  },

  save(partial: Partial<EditableOperationalSettings>): SettingsSnapshot {
    overrides = {
      ...overrides,
      ...sanitizeOverrides(partial as Record<string, unknown>),
    };
    persistOverrides();
    return this.getSnapshot();
  },

  reset(keys?: Array<keyof EditableOperationalSettings>): SettingsSnapshot {
    if (Array.isArray(keys) && keys.length) {
      const nextOverrides = { ...overrides };
      for (const key of keys) {
        delete nextOverrides[key];
      }
      overrides = nextOverrides;
    } else {
      overrides = {};
    }
    persistOverrides();
    return this.getSnapshot();
  },

  getEffective(): EditableOperationalSettings {
    return buildEffective();
  },

  getFilePath(): string {
    return settingsFile;
  },
};
