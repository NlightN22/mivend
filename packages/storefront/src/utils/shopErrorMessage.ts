import { i18n } from '../i18n';

// Server ErrorResult messages are English-only, so the toast is keyed by errorCode instead.
export function shopErrorMessage(
    result: { errorCode?: string | null } | null | undefined,
    fallbackKey: string,
): string {
    const key = `shopErrors.${result?.errorCode ?? ''}`;
    return i18n.global.t(result?.errorCode && i18n.global.te(key) ? key : fallbackKey);
}
