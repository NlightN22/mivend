import type { CaptchaProvider, CaptchaVerdict } from './captcha-provider';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 3000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export class TurnstileProvider implements CaptchaProvider {
    readonly name = 'turnstile';

    constructor(
        readonly siteKey: string,
        private secretKey: string,
        private fetchImpl: Fetch = fetch,
        private verifyUrl: string = VERIFY_URL,
    ) {}

    async verify(token: string, remoteIp: string): Promise<CaptchaVerdict> {
        try {
            const response = await this.fetchImpl(this.verifyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    secret: this.secretKey,
                    response: token,
                    remoteip: remoteIp,
                }),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (!response.ok) return 'unavailable';
            const body = (await response.json()) as { success?: boolean };
            return body.success === true ? 'valid' : 'invalid';
        } catch {
            return 'unavailable';
        }
    }
}
