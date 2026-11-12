import { describe, expect, it } from 'vitest';

import { createInFlightOperations } from '../../slow-request-log/in-flight';

describe('in-flight operations', () => {
    it('lists the oldest operations first with their age and forgets finished ones', () => {
        const tracker = createInFlightOperations();
        const doneA = tracker.start('DiscountFacets', 1000);
        tracker.start('SettlementsPage', 1200);
        expect(tracker.describe(2000)).toBe(
            'in flight, oldest first: DiscountFacets 1000 ms, SettlementsPage 800 ms',
        );
        doneA();
        expect(tracker.describe(2000)).toBe('in flight, oldest first: SettlementsPage 800 ms');
    });

    it('never prints a free-form operation name and caps the list', () => {
        const tracker = createInFlightOperations();
        tracker.start('x {a:"secret@mail"}', 0);
        for (let i = 0; i < 10; i++) tracker.start(`Op${i}`, i + 1);
        const text = tracker.describe(100);
        expect(text).not.toContain('secret');
        expect(text).toContain('anonymous-operation');
        expect(text).toContain('and 3 more');
    });

    it('says so when nothing is in flight', () => {
        expect(createInFlightOperations().describe(5)).toBe('none in flight');
    });
});
