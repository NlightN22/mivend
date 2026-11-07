const pending = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
    const cached = pending.get(src);
    if (cached) return cached;
    const promise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
            script.remove();
            reject(new Error('script failed'));
        };
        document.head.appendChild(script);
    });
    pending.set(src, promise);
    promise.catch(() => pending.delete(src));
    return promise;
}
