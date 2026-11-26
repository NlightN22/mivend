export function proformaPdfUrl(
    document: { status: string; pdfUrl?: string | null } | null | undefined,
): string | null {
    return document?.status === 'ready' ? (document.pdfUrl ?? null) : null;
}

export function openPdf(url: string): void {
    window.open(url, '_blank', 'noopener');
}
