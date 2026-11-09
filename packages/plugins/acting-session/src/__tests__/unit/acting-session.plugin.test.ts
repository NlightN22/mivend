import { describe, expect, it } from 'vitest';

import { ActingMutationLogInterceptor } from '../../acting-mutation-log.interceptor';
import { ActingSessionPlugin } from '../../acting-session.plugin';

describe('ActingSessionPlugin wiring', () => {
    it('registers the interceptor that refuses account-security mutations as a global interceptor', () => {
        const providers = Reflect.getMetadata('providers', ActingSessionPlugin) as Array<{
            provide?: string;
            useClass?: unknown;
        }>;

        expect(
            providers.some(
                p => p.provide === 'APP_INTERCEPTOR' && p.useClass === ActingMutationLogInterceptor,
            ),
        ).toBe(true);
    });
});
