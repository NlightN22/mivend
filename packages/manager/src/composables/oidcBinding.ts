const KEY = 'mv_oidc_state';

// Ties the provider round trip to this browser tab, so a callback link made elsewhere cannot sign it in.
export function rememberOidcState(authorizationUrl: string): void {
    const state = new URL(authorizationUrl).searchParams.get('state') ?? '';
    try {
        sessionStorage.setItem(KEY, state);
    } catch {
        // best-effort: without storage the callback is refused, which fails closed
    }
}

export function consumeOidcState(returned: string): boolean {
    try {
        const stored = sessionStorage.getItem(KEY);
        sessionStorage.removeItem(KEY);
        return stored !== null && stored !== '' && stored === returned;
    } catch {
        return false;
    }
}
