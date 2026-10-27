export const DEFAULT_SITE_NAME = 'Shop';

export function readSiteName(doc: Pick<Document, 'querySelector'> = document): string {
    const content = doc.querySelector('meta[name="site-name"]')?.getAttribute('content')?.trim();
    return content || DEFAULT_SITE_NAME;
}
