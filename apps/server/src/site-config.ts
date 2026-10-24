type Env = Record<string, string | undefined>;

const DEFAULT_SITE_NAME = 'Shop';
const FAVICON_PATTERN = /^(https?:\/\/|\/)[^\s'"$;{}\\<>]*$/;

export function siteName(env: Env): string {
    const name = env.SITE_NAME || DEFAULT_SITE_NAME;
    if (/["'\r\n<>&$;\\]/.test(name)) {
        throw new Error('SITE_NAME must not contain quotes, line breaks or any of < > & $ ; \\');
    }
    return name;
}

export function siteFaviconUrl(env: Env): string | undefined {
    const url = env.SITE_FAVICON_URL;
    if (url && !FAVICON_PATTERN.test(url)) {
        throw new Error(
            'SITE_FAVICON_URL must be an http(s) URL or a /path without spaces, quotes or any of $ ; { } \\ < >',
        );
    }
    return url || undefined;
}
