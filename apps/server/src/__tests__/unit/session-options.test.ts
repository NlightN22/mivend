import { describe, expect, it } from 'vitest';

import { sessionOptionsFromEnv } from '../../session-options';

describe('sessionOptionsFromEnv', () => {
    it('defaults to a 30-day session and 20 active sessions per user', () => {
        expect(sessionOptionsFromEnv({})).toEqual({
            sessionDuration: '30d',
            maxActiveSessionsPerUser: 20,
        });
    });

    it('takes both values from the environment', () => {
        expect(
            sessionOptionsFromEnv({ SESSION_DURATION: '7d', SESSION_MAX_ACTIVE_PER_USER: '5' }),
        ).toEqual({ sessionDuration: '7d', maxActiveSessionsPerUser: 5 });
    });

    it.each(['0', '-1', '2.5', 'many'])('refuses a cap of "%s"', value => {
        expect(() => sessionOptionsFromEnv({ SESSION_MAX_ACTIVE_PER_USER: value })).toThrow(
            /SESSION_MAX_ACTIVE_PER_USER/,
        );
    });
});
