export type CaptchaVerdict = 'valid' | 'invalid' | 'unavailable';

// Turnstile today; a self-hosted proof-of-work service replaces it by implementing this.
export interface CaptchaProvider {
    readonly name: string;
    readonly siteKey: string;
    verify(token: string, remoteIp: string): Promise<CaptchaVerdict>;
}
