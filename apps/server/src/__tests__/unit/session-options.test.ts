import { describe, expect, it } from 'vitest';

import { sessionOptionsFromEnv } from '../../session-options';

describe('sessionOptionsFromEnv', () => {
    it('defaults to 30 days, 2 customer and 3 staff sessions, daily reset off at 03:00 UTC', () => {
        expect(sessionOptionsFromEnv({})).toEqual({
            sessionDuration: '30d',
            maxActiveSessionsCustomer: 2,
            maxActiveSessionsStaff: 3,
            knownDeviceRetentionDays: 400,
            dailyReset: { enabled: false, hour: 3 },
        });
    });

    it('takes every value from the environment', () => {
        expect(
            sessionOptionsFromEnv({
                SESSION_DURATION: '7d',
                SESSION_MAX_ACTIVE_CUSTOMER: '5',
                SESSION_MAX_ACTIVE_STAFF: '6',
                SESSION_DAILY_RESET_ENABLED: 'true',
                SESSION_DAILY_RESET_HOUR: '4',
            }),
        ).toEqual({
            sessionDuration: '7d',
            maxActiveSessionsCustomer: 5,
            maxActiveSessionsStaff: 6,
            knownDeviceRetentionDays: 400,
            dailyReset: { enabled: true, hour: 4 },
        });
    });

    it.each(['0', '-1', '2.5', 'many'])('refuses a cap of "%s"', value => {
        expect(() => sessionOptionsFromEnv({ SESSION_MAX_ACTIVE_CUSTOMER: value })).toThrow(
            /SESSION_MAX_ACTIVE_CUSTOMER/,
        );
        expect(() => sessionOptionsFromEnv({ SESSION_MAX_ACTIVE_STAFF: value })).toThrow(
            /SESSION_MAX_ACTIVE_STAFF/,
        );
    });

    it.each(['24', '-1', 'x'])('refuses a reset hour of "%s"', value => {
        expect(() => sessionOptionsFromEnv({ SESSION_DAILY_RESET_HOUR: value })).toThrow(
            /SESSION_DAILY_RESET_HOUR/,
        );
    });

    it('refuses an unknown time zone', () => {
        expect(() => sessionOptionsFromEnv({ SESSION_DAILY_RESET_TIME_ZONE: 'UTC' })).toThrow(
            /SESSION_DAILY_RESET_TIME_ZONE/,
        );
    });

    it.each(['true', 'TRUE', '1'])('reads "%s" as an enabled reset', value => {
        expect(
            sessionOptionsFromEnv({ SESSION_DAILY_RESET_ENABLED: value }).dailyReset.enabled,
        ).toBe(true);
    });

    it.each(['false', '0', ''])('reads "%s" as a disabled reset', value => {
        expect(
            sessionOptionsFromEnv({ SESSION_DAILY_RESET_ENABLED: value }).dailyReset.enabled,
        ).toBe(false);
    });

    it('refuses a garbage reset flag', () => {
        expect(() => sessionOptionsFromEnv({ SESSION_DAILY_RESET_ENABLED: 'yes' })).toThrow(
            /SESSION_DAILY_RESET_ENABLED/,
        );
    });

    it('refuses the removed single cap with a pointer to the new variables', () => {
        expect(() => sessionOptionsFromEnv({ SESSION_MAX_ACTIVE_PER_USER: '20' })).toThrow(
            /SESSION_MAX_ACTIVE_CUSTOMER/,
        );
    });
});
