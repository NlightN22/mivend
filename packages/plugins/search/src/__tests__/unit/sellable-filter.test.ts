import { describe, expect, it } from 'vitest';
import type { ProductVariant } from '@vendure/core';

import {
    HAS_ORGANIZATION_FIELD,
    hasOrganizationMapping,
    restrictToSellable,
} from '../../sellable-filter';

const variant = (customFields: Record<string, unknown> | undefined) =>
    ({ customFields }) as unknown as ProductVariant;

describe('restrictToSellable', () => {
    it('adds the organization filter for the shop view', () => {
        const query = { bool: { filter: [{ term: { channelId: 1 } }] } };
        restrictToSellable(query, true);
        expect(query.bool.filter).toEqual([
            { term: { channelId: 1 } },
            { term: { [HAS_ORGANIZATION_FIELD]: true } },
        ]);
    });

    it('leaves the staff view (enabledOnly=false) unfiltered', () => {
        const query = { bool: { filter: [] as unknown[] } };
        restrictToSellable(query, false);
        expect(query.bool.filter).toEqual([]);
    });
});

describe('hasOrganizationMapping', () => {
    it('is true only when the variant carries an organization', () => {
        expect(hasOrganizationMapping.valueFn(variant({ organizationId: 7 }))).toBe(true);
        expect(hasOrganizationMapping.valueFn(variant({ organizationId: null }))).toBe(false);
        expect(hasOrganizationMapping.valueFn(variant({}))).toBe(false);
        expect(hasOrganizationMapping.valueFn(variant(undefined))).toBe(false);
    });
});
