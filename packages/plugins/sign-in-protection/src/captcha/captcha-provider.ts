export type CaptchaVerdict = 'valid' | 'invalid' | 'unavailable';

// Any widget-and-verify service implements this; the portals load `scriptUrl` only when a challenge is due.
export interface CaptchaProvider {
    readonly name: string;
    readonly siteKey: string;
    readonly scriptUrl: string;
    readonly widgetGlobal: string;
    verify(token: string, remoteIp: string): Promise<CaptchaVerdict>;
}
