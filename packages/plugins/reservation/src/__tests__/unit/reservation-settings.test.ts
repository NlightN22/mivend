import { describe, expect, it } from 'vitest';
import { ReservationSettings } from '../../reservation-settings';

describe('ReservationSettings', () => {
    it('falls back to the built-in defaults, independent of each other', () => {
        const settings = new ReservationSettings({});
        expect(settings.defaultReservationDays()).toBe(3);
        expect(settings.rejectedOrderReleaseDays()).toBe(3);
    });

    it('reads both plugin options independently', () => {
        const settings = new ReservationSettings({
            defaultReservationDays: 5,
            rejectedOrderReleaseDays: 7,
        });
        expect(settings.defaultReservationDays()).toBe(5);
        expect(settings.rejectedOrderReleaseDays()).toBe(7);
    });
});
