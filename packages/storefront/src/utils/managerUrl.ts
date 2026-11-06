export function readManagerUrl(doc: Pick<Document, 'querySelector'> = document): string | null {
    const content = doc.querySelector('meta[name="manager-url"]')?.getAttribute('content')?.trim();
    const fromMeta = content?.replace(/\/+$/, '');
    if (fromMeta) return fromMeta;
    const fromEnv = (import.meta.env.VITE_MANAGER_URL as string | undefined)?.trim();
    return fromEnv ? fromEnv.replace(/\/+$/, '') : null;
}

export function managerOrderUrl(
    orderCode: string,
    base: string | null = readManagerUrl(),
): string | null {
    return base ? `${base}/orders/${encodeURIComponent(orderCode)}` : null;
}
