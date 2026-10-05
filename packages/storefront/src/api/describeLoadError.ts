export interface LoadErrorText {
    title: string;
    message: string;
}

const NO_CONNECTION: LoadErrorText = {
    title: 'No connection',
    message: 'Check your internet connection and try again.',
};
const SERVER_BUSY: LoadErrorText = {
    title: 'The server is busy',
    message: 'Please wait a moment and try again.',
};
const GENERIC: LoadErrorText = {
    title: 'Something went wrong',
    message: 'Please try again.',
};

const TIMEOUT_PATTERN = /abort|timeout|timed out/i;
const SERVER_ERROR_PATTERN = /^Shop API error: 5\d\d$/;

export function describeLoadError(err: unknown): LoadErrorText {
    const isNetworkError = err instanceof Error && err.name === 'ApiNetworkError';
    if (isNetworkError && TIMEOUT_PATTERN.test(err.message)) return SERVER_BUSY;
    if (isNetworkError || err instanceof TypeError) return NO_CONNECTION;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return NO_CONNECTION;
    if (err instanceof Error && SERVER_ERROR_PATTERN.test(err.message)) return SERVER_BUSY;
    return GENERIC;
}
