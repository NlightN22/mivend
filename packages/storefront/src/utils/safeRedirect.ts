export function safeRedirect(target: unknown): string | null {
    return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
        ? target
        : null;
}
