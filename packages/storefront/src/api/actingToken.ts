const KEY = 'mv_acting_session';

export interface ActingSessionData {
    token: string;
    expiresAt: string;
}

export function readActingSession(): ActingSessionData | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<ActingSessionData>;
        return typeof parsed.token === 'string' && typeof parsed.expiresAt === 'string'
            ? { token: parsed.token, expiresAt: parsed.expiresAt }
            : null;
    } catch {
        return null;
    }
}

export function saveActingSession(data: ActingSessionData): void {
    try {
        sessionStorage.setItem(KEY, JSON.stringify(data));
    } catch {
        // storage unavailable: the acting tab cannot persist across reloads
    }
}

export function clearActingSession(): void {
    try {
        sessionStorage.removeItem(KEY);
    } catch {
        // nothing to clear
    }
}

export function actingHeaders(): Record<string, string> {
    const session = readActingSession();
    return session ? { Authorization: `Bearer ${session.token}`, 'x-acting-session': '1' } : {};
}

export function actingCredentials(): RequestCredentials {
    return readActingSession() ? 'omit' : 'include';
}
