import { describe, expect, it } from 'vitest';

import { orderBranchClause } from '../../order-branch-clause';

describe('orderBranchClause', () => {
    it('compares the trading point id as an integer so its primary key index is used', () => {
        const { sql, params } = orderBranchClause('order', 'counterparty', 'branch-a', 'branch-b');

        expect(sql).not.toContain('tp.id::text');
        expect(sql).toContain(
            `tp.id = CASE WHEN "order"."customFieldsTradingpointid" ~ '^[1-9][0-9]{0,8}$' THEN "order"."customFieldsTradingpointid"::int END`,
        );
        expect(params).toEqual({ branchId: 'branch-a', orderDefaultBranchId: 'branch-b' });
    });
});
