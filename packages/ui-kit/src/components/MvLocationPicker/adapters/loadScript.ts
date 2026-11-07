import { LOAD_TIMEOUT_MS } from './withTimeout';

const pending = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
    const cached = pending.get(src);
    if (cached) return cached;
    const promise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        const fail = (reason: string): void => {
            script.remove();
            reject(new Error(reason));
        };
        const timer = setTimeout(() => fail('script timed out'), LOAD_TIMEOUT_MS);
        script.onload = () => {
            clearTimeout(timer);
            resolve();
        };
        script.onerror = () => {
            clearTimeout(timer);
            fail('script failed');
        };
        document.head.appendChild(script);
    });
    pending.set(src, promise);
    promise.catch(() => pending.delete(src));
    return promise;
}
