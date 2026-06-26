import type { Adapter1cOptions } from './types';

export class Client1c {
    private readonly authHeader: string;
    private readonly timeoutMs: number;

    constructor(private readonly options: Adapter1cOptions) {
        const credentials = Buffer.from(`${options.username}:${options.password}`).toString(
            'base64',
        );
        this.authHeader = `Basic ${credentials}`;
        this.timeoutMs = options.timeoutMs ?? 10_000;
    }

    async get<T>(path: string, params?: Record<string, string>): Promise<T> {
        const url = new URL(path, this.options.baseUrl);
        if (params) {
            for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const res = await fetch(url.toString(), {
                headers: { Authorization: this.authHeader, Accept: 'application/json' },
                signal: controller.signal,
            });
            if (!res.ok) throw new Error(`1C HTTP ${res.status}: ${await res.text()}`);
            return res.json() as Promise<T>;
        } finally {
            clearTimeout(timer);
        }
    }

    async post<T>(path: string, body: unknown): Promise<T> {
        const url = new URL(path, this.options.baseUrl);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const res = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    Authorization: this.authHeader,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            if (!res.ok) throw new Error(`1C HTTP ${res.status}: ${await res.text()}`);
            return res.json() as Promise<T>;
        } finally {
            clearTimeout(timer);
        }
    }
}
