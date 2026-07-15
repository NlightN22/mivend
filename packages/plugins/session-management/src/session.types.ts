export const loggerCtx = 'SessionManagementPlugin';

export const SESSION_MANAGEMENT_PLUGIN_OPTIONS = Symbol('SESSION_MANAGEMENT_PLUGIN_OPTIONS');

// DB hygiene only, not a security control — Vendure already gates access via the `expires`
// check at auth time (see SessionService.findSessionByToken()). An hourly sweep is plenty.
export const CLEANUP_POLL_INTERVAL_DEFAULT = 60 * 60_000;

export interface SessionManagementPluginOptions {
    redis: {
        host: string;
        port: number;
        password?: string;
        // Logical Redis DB index — must differ between a central and a branch instance sharing
        // the same physical Redis server, otherwise the fixed-name 'session-cleanup' BullMQ
        // queue collides and one instance's worker can pick up the other's job.
        db?: number;
    };
    cleanupPollIntervalMs?: number;
}

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
