import { describe, expect, it } from 'vitest';
import { tradingPointErrors } from '../../pages/account/tradingPointValidation';

const base = {
    name: 'Point',
    address: 'Main street 12, office 3',
    contactName: 'Ivan Petrov',
    contactPhone: '+7 (913) 123-45-67',
    workingHours: '',
    deliveryComment: '',
    latitude: 55.75 as number | null,
    longitude: 37.62 as number | null,
};

describe('tradingPointErrors', () => {
    it('accepts a valid form', () => expect(tradingPointErrors(base)).toEqual({}));

    it('flags bad new values', () => {
        const errors = tradingPointErrors({
            ...base,
            address: 'Somewhere',
            contactName: 'Ivan',
            contactPhone: '+7 (913',
        });
        expect(Object.keys(errors).sort()).toEqual(['address', 'contactName', 'contactPhone']);
    });

    it('leaves untouched ERP values alone but checks edited ones', () => {
        const original = {
            ...base,
            address: 'Somewhere',
            contactName: 'Ivanov',
            contactPhone: '123',
        };
        expect(tradingPointErrors(original, original)).toEqual({});
        expect(
            Object.keys(tradingPointErrors({ ...original, contactPhone: '+7 (91' }, original)),
        ).toEqual(['contactPhone']);
    });

    it('requires a location, even for an untouched point that has none', () => {
        const noLocation = { ...base, latitude: null, longitude: null };
        expect(Object.keys(tradingPointErrors(noLocation))).toEqual(['location']);
        expect(Object.keys(tradingPointErrors(noLocation, noLocation))).toEqual(['location']);
        expect(Object.keys(tradingPointErrors({ ...base, longitude: null }))).toEqual(['location']);
    });
});
