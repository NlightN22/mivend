// The `redirect` search param is user-controlled: only same-origin paths are followed.
export function resolveRedirectTarget(search: string, fallback = '/'): string {
    const target = new URLSearchParams(search).get('redirect');
    if (!target || !target.startsWith('/') || target.startsWith('//') || target.includes('\\')) {
        return fallback;
    }
    return target;
}
