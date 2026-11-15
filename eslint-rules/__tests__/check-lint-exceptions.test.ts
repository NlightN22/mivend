import { describe, expect, it } from 'vitest';

// @ts-expect-error plain ESM script without types
import { unlistedWarnings } from '../check-lint-exceptions.mjs';

const list = {
    checkedRules: ['locks/no-raw-advisory-lock'],
    exceptions: [{ rule: 'locks/no-raw-advisory-lock', file: 'a/listed.ts', reason: 'x' }],
};
const result = (
    file: string,
    ruleId: string,
): { filePath: string; messages: Array<{ ruleId: string; line: number; message: string }> } => ({
    filePath: `/repo/${file}`,
    messages: [{ ruleId, line: 3, message: 'm' }],
});

describe('unlistedWarnings', () => {
    it('passes a listed file and ignores rules outside the checked set', () => {
        const results = [
            result('a/listed.ts', 'locks/no-raw-advisory-lock'),
            result('b/other.ts', 'mivend/max-comment-lines'),
        ];
        expect(unlistedWarnings(results, list, '/repo')).toEqual([]);
    });

    it('reports a checked-rule warning that is not on the list', () => {
        const found = unlistedWarnings(
            [result('b/new.ts', 'locks/no-raw-advisory-lock')],
            list,
            '/repo',
        );
        expect(found).toEqual([
            { rule: 'locks/no-raw-advisory-lock', file: 'b/new.ts', line: 3, message: 'm' },
        ]);
    });
});
