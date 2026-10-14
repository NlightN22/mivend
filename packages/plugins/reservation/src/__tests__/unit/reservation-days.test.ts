import { afterEach, describe, expect, it } from 'vitest';
import { defaultReservationDays, setDefaultReservationDays } from '../../reservation-days';
import { DEFAULT_RESERVATION_DAYS } from '../../types';

describe('defaultReservationDays', () => {
    afterEach(() => setDefaultReservationDays(undefined));

    it('falls back to the built-in default', () => {
        expect(defaultReservationDays()).toBe(DEFAULT_RESERVATION_DAYS);
    });

    it('follows the plugin option so auto-reserve paths do not use the constant', () => {
        setDefaultReservationDays(5);
        expect(defaultReservationDays()).toBe(5);
    });
});
