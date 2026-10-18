import { describe, expect, it } from 'vitest';

import { parseErpFullName } from '../../erp-full-name';

describe('parseErpFullName', () => {
    it('maps surname to lastName and name with patronymic to firstName', () => {
        expect(parseErpFullName('Иванов Сергей Владимирович', 'a@b.c')).toEqual({
            firstName: 'Сергей Владимирович',
            lastName: 'Иванов',
        });
    });

    it('handles a surname and name without patronymic', () => {
        expect(parseErpFullName('Petrov Ivan', 'a@b.c')).toEqual({
            firstName: 'Ivan',
            lastName: 'Petrov',
        });
    });

    it('uses a single word as firstName', () => {
        expect(parseErpFullName('Ivan', 'a@b.c')).toEqual({ firstName: 'Ivan', lastName: '-' });
    });

    it('collapses extra whitespace', () => {
        expect(parseErpFullName('  Petrov   Ivan\t Ivanovich ', 'a@b.c')).toEqual({
            firstName: 'Ivan Ivanovich',
            lastName: 'Petrov',
        });
    });

    it.each([null, undefined, '', '   '])('falls back to the email for %j', value => {
        expect(parseErpFullName(value, 'a@b.c')).toEqual({ firstName: 'a@b.c', lastName: '-' });
    });
});
