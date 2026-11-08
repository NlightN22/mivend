import type { ApiOptions } from '@vendure/core';

type ApiSecurityOptions = Pick<ApiOptions, 'cors' | 'csrfPrevention'>;

export function apiSecurityOptionsFromEnv(env: NodeJS.ProcessEnv): ApiSecurityOptions {
    const origins = (env.CORS_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map(origin => origin.trim())
        .filter(origin => origin !== '');
    if (origins.includes('*')) {
        throw new Error('CORS_ALLOWED_ORIGINS must list explicit origins, "*" is not allowed');
    }
    return {
        // Frontends proxy the API on their own origin, so without a list no CORS headers are sent.
        cors: origins.length === 0 ? false : { origin: origins, credentials: true },
        csrfPrevention: true,
    };
}
