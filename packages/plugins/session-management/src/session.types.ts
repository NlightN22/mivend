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
