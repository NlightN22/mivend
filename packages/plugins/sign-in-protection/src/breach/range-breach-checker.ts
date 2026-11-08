import { createHash } from 'node:crypto';

import type { BreachedPasswordChecker, BreachVerdict } from './breached-password-checker';

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

// k-anonymity range lookup: only the first 5 hex characters of the SHA-1 leave the server.
export class RangeBreachChecker implements BreachedPasswordChecker {
    constructor(
        private apiUrl: string,
        private timeoutMs: number,
        private fetchImpl: Fetch = fetch,
    ) {}

    async check(password: string): Promise<BreachVerdict> {
        const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
        try {
            const response = await this.fetchImpl(`${this.apiUrl}/range/${hash.slice(0, 5)}`, {
                headers: { 'Add-Padding': 'true' },
                signal: AbortSignal.timeout(this.timeoutMs),
            });
            if (!response.ok) return 'unavailable';
            const suffix = hash.slice(5);
            for (const line of (await response.text()).split('\n')) {
                const [candidate, count] = line.trim().split(':');
                if (candidate === suffix && Number(count) > 0) return 'breached';
            }
            return 'clean';
        } catch {
            return 'unavailable';
        }
    }
}
