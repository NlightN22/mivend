const PREFIX = 'mv_oidc_state:';
const TTL_MS = 10 * 60 * 1000;

// Ties the provider round trip to this browser; local storage, not per-tab, so a verification link opened in a new tab still completes.
export function rememberOidcState(authorizationUrl: string): void {
    const state = new URL(authorizationUrl).searchParams.get('state') ?? '';
    if (state === '') return;
    try {
        dropExpired();
        localStorage.setItem(PREFIX + state, String(Date.now()));
    } catch {
        // best-effort: without storage the callback is refused, which fails closed
    }
}

export function consumeOidcState(returned: string): boolean {
    if (returned === '') return false;
    try {
        const stored = localStorage.getItem(PREFIX + returned);
        localStorage.removeItem(PREFIX + returned);
        return stored !== null && Date.now() - Number(stored) < TTL_MS;
    } catch {
        return false;
    }
}

function dropExpired(): void {
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(PREFIX) && Date.now() - Number(localStorage.getItem(key)) >= TTL_MS) {
            localStorage.removeItem(key);
        }
    }
}
