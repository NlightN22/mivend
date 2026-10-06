import { describe, it, expect } from 'vitest';

import { parseCreditOverrun } from './creditOverrun';

describe('parseCreditOverrun', () => {
    it('parses the server decline message', () => {
        const message =
            'credit-limit-exceeded: {"creditLimit":1000,"creditBalance":900,"orderTotal":500}';
        expect(parseCreditOverrun(message)).toEqual({
            creditLimit: 1000,
            creditBalance: 900,
            orderTotal: 500,
        });
    });

    it.each([undefined, null, '', 'Payment declined', 'credit-limit-exceeded: {broken'])(
        'ignores %j',
        message => {
            expect(parseCreditOverrun(message)).toBeUndefined();
        },
    );
});
