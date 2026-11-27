import type { RequestContext } from '@vendure/core';
import { UserInputError } from '@vendure/core';
import { QueryTooLargeError } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveGroupFilters } from '../../order-analytics/order-analytics-group-filters';
import type { GroupFilterKind } from '../../order-analytics/order-analytics-group-filters';
import type { OrderAnalyticsGroupsService } from '../../order-analytics/order-analytics-groups.service';

const ctx = {} as RequestContext;
const erpIds = vi.fn();
const groups = { erpIds } as unknown as OrderAnalyticsGroupsService;
const ALL: GroupFilterKind[] = ['MANUFACTURER_GROUP', 'PRODUCT_CATEGORY', 'CUSTOMER_GROUP'];

beforeEach(() => vi.resetAllMocks());

describe('resolveGroupFilters', () => {
    it('turns our ids into ERP ids, include and exclude kept apart', async () => {
        erpIds.mockImplementation(async (_c, _k, ids: string[]) => ids.map(id => `erp-${id}`));

        const result = await resolveGroupFilters(
            ctx,
            groups,
            [
                { kind: 'MANUFACTURER_GROUP', ids: ['1', '2', '1'] },
                { kind: 'MANUFACTURER_GROUP', ids: ['3'], exclude: true },
            ],
            ALL,
        );

        expect(erpIds).toHaveBeenCalledWith(ctx, 'MANUFACTURER_GROUP', ['1', '2']);
        expect(result).toMatchObject({
            manufacturerGroupIds: ['erp-1', 'erp-2'],
            excludeManufacturerGroupIds: ['erp-3'],
            unmatched: false,
        });
    });

    it('selects no rows when an include group resolves to nothing', async () => {
        erpIds.mockResolvedValue([]);
        const result = await resolveGroupFilters(
            ctx,
            groups,
            [{ kind: 'MANUFACTURER_GROUP', ids: ['9'] }],
            ALL,
        );
        expect(result.unmatched).toBe(true);
    });

    it('excludes nothing, and does not empty the result, when an exclude group resolves to nothing', async () => {
        erpIds.mockResolvedValue([]);
        const result = await resolveGroupFilters(
            ctx,
            groups,
            [{ kind: 'MANUFACTURER_GROUP', ids: ['9'], exclude: true }],
            ALL,
        );
        expect(result).toMatchObject({ unmatched: false, excludeManufacturerGroupIds: [] });
    });

    it('maps category and customer groups', async () => {
        erpIds.mockImplementation(async (_c, _k, ids: string[]) => ids.map(id => `erp-${id}`));
        const result = await resolveGroupFilters(
            ctx,
            groups,
            [
                { kind: 'PRODUCT_CATEGORY', ids: ['1'] },
                { kind: 'PRODUCT_CATEGORY', ids: ['2'], exclude: true },
                { kind: 'CUSTOMER_GROUP', ids: ['3'] },
                { kind: 'CUSTOMER_GROUP', ids: ['4'], exclude: true },
            ],
            ALL,
        );
        expect(result).toMatchObject({
            productCategoryIds: ['erp-1'],
            excludeProductCategoryIds: ['erp-2'],
            customerGroupIds: ['erp-3'],
            excludeCustomerGroupIds: ['erp-4'],
        });
    });

    it('refuses a group kind the report does not offer', async () => {
        await expect(
            resolveGroupFilters(
                ctx,
                groups,
                [{ kind: 'MANUFACTURER_GROUP', ids: ['1'] }],
                ['CUSTOMER_GROUP'],
            ),
        ).rejects.toBeInstanceOf(UserInputError);
    });

    it('fails closed above 1000 group ids instead of cutting the list', async () => {
        const ids = Array.from({ length: 1001 }, (_, i) => String(i + 1));
        await expect(
            resolveGroupFilters(ctx, groups, [{ kind: 'MANUFACTURER_GROUP', ids }], ALL),
        ).rejects.toBeInstanceOf(QueryTooLargeError);
        expect(erpIds).not.toHaveBeenCalled();
    });

    it('fails closed when several filters of one kind add up above 1000', async () => {
        erpIds.mockImplementation(async (_c, _k, ids: string[]) => ids);
        const half = Array.from({ length: 600 }, (_, i) => String(i));
        const other = Array.from({ length: 600 }, (_, i) => String(i + 1000));
        await expect(
            resolveGroupFilters(
                ctx,
                groups,
                [
                    { kind: 'MANUFACTURER_GROUP', ids: half },
                    { kind: 'MANUFACTURER_GROUP', ids: other },
                ],
                ALL,
            ),
        ).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});
