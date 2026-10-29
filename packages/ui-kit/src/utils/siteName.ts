export const DEFAULT_SITE_NAME = 'Shop';

export function readSiteName(doc: Pick<Document, 'querySelector'> = document): string {
    const content = doc.querySelector('meta[name="site-name"]')?.getAttribute('content')?.trim();
    return content || DEFAULT_SITE_NAME;
}

export const DEFAULT_SITE_ICON_HREF = '/favicon.svg';

export function readSiteIconUrl(doc: Pick<Document, 'querySelector'> = document): string | null {
    const href = doc.querySelector('link[rel="icon"]')?.getAttribute('href')?.trim();
    return href && href !== DEFAULT_SITE_ICON_HREF ? href : null;
}
