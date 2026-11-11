import { describe, expect, it } from 'vitest';

import { numberMatch } from '../../settlement-search.provider';

describe('numberMatch', () => {
    it('uses a bounded prefix lookup below three characters, escaping wildcards', () => {
        const { sql, params } = numberMatch('a%');
        expect(sql).toContain('LIKE lower(:gsTerm)');
        expect(sql).toContain('LIMIT 200');
        expect(params.gsTerm).toBe('a\\%');
    });

    it('uses a contains match from three characters, escaping wildcards', () => {
        const { sql, params } = numberMatch('a_b');
        expect(sql).toContain('ILIKE :gsTerm');
        expect(sql).not.toContain('LIMIT');
        expect(params.gsTerm).toBe('%a\\_b%');
    });
});
