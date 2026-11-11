import { describe, expect, it } from 'vitest';

import {
    expectNoUnlimitedSelect,
    expectRowBudget,
    selectsWithoutLimit,
} from '../../testing/row-budget';

describe('expectRowBudget', () => {
    it('accepts an array or a page within the budget', () => {
        expect(() => expectRowBudget([1, 2], 2)).not.toThrow();
        expect(() => expectRowBudget({ items: [1] }, 2)).not.toThrow();
    });

    it('fails when more rows come back than the budget', () => {
        expect(() => expectRowBudget({ items: [1, 2, 3] }, 2)).toThrow('row budget exceeded');
    });
});

describe('selectsWithoutLimit', () => {
    const limited = 'SELECT "r"."id" FROM "page_row" "r" ORDER BY "r"."id" ASC LIMIT 5';
    const unlimited = 'SELECT "r"."id" FROM "page_row" "r" ORDER BY "r"."id" ASC';
    const count = 'SELECT COUNT(1) AS "cnt" FROM "page_row" "r"';

    it('flags a SELECT on the table without LIMIT', () => {
        expect(selectsWithoutLimit([limited, unlimited, count], 'page_row')).toEqual([unlimited]);
    });

    it('ignores other tables, writes and schema-qualified limited reads', () => {
        expect(
            selectsWithoutLimit(
                ['SELECT 1 FROM "other" "o"', 'DELETE FROM "page_row" "r"'],
                'page_row',
            ),
        ).toEqual([]);
        expect(
            selectsWithoutLimit(['SELECT "r"."id" FROM "s"."page_row" "r" LIMIT 1'], 'page_row'),
        ).toEqual([]);
    });

    it('expectNoUnlimitedSelect throws on an offender', () => {
        expect(() => expectNoUnlimitedSelect([unlimited], 'page_row')).toThrow('unlimited SELECT');
    });
});
