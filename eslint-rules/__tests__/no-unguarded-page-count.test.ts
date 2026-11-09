import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

import rule from '../no-unguarded-page-count.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } }).run(
    'no-unguarded-page-count',
    rule,
    {
        valid: ['getPageAndCount(qb, take, skip);', 'qb.getMany();', 'repo.count({ where });'],
        invalid: [
            { code: 'qb.getManyAndCount();', errors: 1 },
            { code: 'await repo.findAndCount({ take });', errors: 1 },
        ],
    },
);
