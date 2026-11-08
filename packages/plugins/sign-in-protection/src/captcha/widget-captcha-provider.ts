import type { CaptchaProvider, CaptchaVerdict } from './captcha-provider';

const TIMEOUT_MS = 3000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface WidgetCaptchaConfig {
    siteKey: string;
    secretKey: string;
    scriptUrl: string;
    verifyUrl: string;
    widgetGlobal: string;
}

// Site key rendered into a container, a response token back, one verify POST with secret, response and remote address.
export class WidgetCaptchaProvider implements CaptchaProvider {
    readonly name = 'widget';
    readonly siteKey: string;
    readonly scriptUrl: string;
    readonly widgetGlobal: string;

    constructor(
        private config: WidgetCaptchaConfig,
        private fetchImpl: Fetch = fetch,
    ) {
        this.siteKey = config.siteKey;
        this.scriptUrl = config.scriptUrl;
        this.widgetGlobal = config.widgetGlobal;
    }

    async verify(token: string, remoteIp: string): Promise<CaptchaVerdict> {
        try {
            const response = await this.fetchImpl(this.config.verifyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    secret: this.config.secretKey,
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
