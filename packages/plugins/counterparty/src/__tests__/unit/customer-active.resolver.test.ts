import { describe, expect, it } from 'vitest';
import { CustomerPortalActiveResolver } from '../../customer-portal-active.resolver';

describe('CustomerPortalActiveResolver.active', () => {
    const resolver = new CustomerPortalActiveResolver();

    it('is true for a live customer', () => {
        expect(resolver.active({ deletedAt: null })).toBe(true);
        expect(resolver.active({})).toBe(true);
    });

    it('is false once portal access was deactivated (soft delete)', () => {
        expect(resolver.active({ deletedAt: new Date('2026-11-01T00:00:00Z') })).toBe(false);
    });
});
