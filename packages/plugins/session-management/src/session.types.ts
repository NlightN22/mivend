export const loggerCtx = 'SessionManagementPlugin';

export const SESSION_MANAGEMENT_PLUGIN_OPTIONS = Symbol('SESSION_MANAGEMENT_PLUGIN_OPTIONS');

// DB hygiene only, not a security control — Vendure already gates access via the `expires`
// check at auth time (see SessionService.findSessionByToken()). An hourly sweep is plenty.
export const CLEANUP_POLL_INTERVAL_DEFAULT = 60 * 60_000;

// A PC and a phone per customer; staff also use the Dashboard and a laptop.
export const MAX_ACTIVE_SESSIONS_CUSTOMER_DEFAULT = 2;
export const MAX_ACTIVE_SESSIONS_STAFF_DEFAULT = 3;

export const DAILY_RESET_POLL_INTERVAL_MS = 5 * 60_000;

export interface DailyResetOptions {
    enabled: boolean;
    hour: number;
}

export interface SessionManagementPluginOptions {
    cleanupPollIntervalMs?: number;
    maxActiveSessionsCustomer?: number;
    maxActiveSessionsStaff?: number;
    dailyReset?: DailyResetOptions;
    deviceCookieSecure?: boolean;
    knownDeviceRetentionDays?: number;
}

export const KNOWN_DEVICE_RETENTION_DAYS_DEFAULT = 400;
export const KNOWN_DEVICES_PER_USER_MAX = 50;
export const NEW_DEVICE_MAIL_MIN_INTERVAL = '1 hour';

// Acting sessions (a manager inside a customer account) and API-key sessions follow their own lifetime rules.
export const OWN_SESSION_SQL = `type = 'AuthenticatedSession' AND invalidated = false
    AND "customFieldsActingadministratorid" IS NULL
    AND "authenticationStrategy" IS DISTINCT FROM 'api-key'`;

export interface SessionSummary {
    id: string;
    userAgent: string | null;
    deviceLabel: string;
    createdAt: Date;
    expires: Date;
    current: boolean;
}

// Rough, best-effort UA -> "OS · Browser" label. Not a real device fingerprint —
// see issue #40's explicit "don't over-promise device-icon accuracy" note.
export function labelForUserAgent(userAgent: string | null): string {
    if (!userAgent) {
        return 'Unknown device';
    }
    const os = /windows/i.test(userAgent)
        ? 'Windows'
        : /android/i.test(userAgent)
          ? 'Android'
          : /iphone|ipad/i.test(userAgent)
            ? 'iOS'
            : /mac os/i.test(userAgent)
              ? 'macOS'
              : /linux/i.test(userAgent)
                ? 'Linux'
                : 'Unknown OS';
    const browser = /edg\//i.test(userAgent)
        ? 'Edge'
        : /chrome\//i.test(userAgent)
          ? 'Chrome'
          : /firefox\//i.test(userAgent)
            ? 'Firefox'
            : /safari\//i.test(userAgent)
              ? 'Safari'
              : 'Unknown browser';
    return `${os} · ${browser}`;
}
