import { i18n } from '../i18n';

export interface LoadErrorText {
    title: string;
    message: string;
}

type ErrorKind = 'noConnection' | 'serverBusy' | 'generic';

function text(kind: ErrorKind): LoadErrorText {
    return {
        title: i18n.global.t(`loadError.${kind}Title`),
        message: i18n.global.t(`loadError.${kind}Message`),
    };
}

const TIMEOUT_PATTERN = /abort|timeout|timed out/i;
const SERVER_ERROR_PATTERN = /^Shop API error: 5\d\d$/;

export function describeLoadError(err: unknown): LoadErrorText {
    const isNetworkError = err instanceof Error && err.name === 'ApiNetworkError';
    if (isNetworkError && TIMEOUT_PATTERN.test(err.message)) return text('serverBusy');
    if (isNetworkError || err instanceof TypeError) return text('noConnection');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return text('noConnection');
    if (err instanceof Error && SERVER_ERROR_PATTERN.test(err.message)) return text('serverBusy');
    return text('generic');
}
