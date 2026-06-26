import { describe, it, expect } from 'vitest';
import type { SyncEvent } from '../sync';

describe('SyncEvent', () => {
    it('should accept valid event types', () => {
        const event: SyncEvent = {
            eventId: 'abc-123',
            eventType: 'product.updated',
            sourceInstanceId: 'central',
            timestamp: new Date().toISOString(),
            payload: { id: '1' },
        };
        expect(event.eventType).toBe('product.updated');
    });
});
