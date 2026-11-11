import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

import rule from '../no-unbounded-query.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } }).run(
    'no-unbounded-query',
    rule,
    {
        valid: [
            'items.find(x => x.id === 1);',
            'await repo.find({ where, take: 50 });',
            'await repo.find({ where, take });',
            'await repo.find({ ...options });',
            'await manager.find(Entity, { where, take: 10 });',
            'await repo.findOne({ where });',
            'await repo.count({ where });',
            'await qb.getOne();',
            'await repo.createQueryBuilder("a").where("x").getCount();',
            'await repo.createQueryBuilder("a").where("x").take(10).getMany();',
            'await repo.createQueryBuilder("a").limit(10).getRawMany();',
            'const qb = repo.createQueryBuilder("a"); qb.take(5); await qb.getMany();',
            'await conn.query("SELECT id FROM t LIMIT 10");',
            'await conn.query("SELECT count(*) FROM t");',
            'await conn.query("UPDATE t SET a = 1");',
            'stream.pipe(out); readable.stream();',
            '// unbounded-ok: registry table, at most a dozen rows by design\nawait repo.find({ where });',
            'await repo.find({ where }); // unbounded-ok: TRACKED #351 needs a product decision',
            '// unbounded-ok: TRACKED parallel-fix documents\nawait repo.find();',
            '// unbounded-ok: one row per warehouse, tens at most\nconst rows = await this.repo\n    .createQueryBuilder("w")\n    .getMany();',
        ],
        invalid: [
            { code: 'await repo.find({ where });', errors: 1 },
            { code: 'await repo.find();', errors: 1 },
            { code: 'await this.orderRepo.find({ take: 0 });', errors: 1 },
            { code: 'await manager.find(Entity, { where });', errors: 1 },
            { code: 'await repo.findBy({ id });', errors: 1 },
            { code: 'await repo.findAndCount({ where });', errors: 1 },
            { code: 'await repo.createQueryBuilder("a").where("x").getMany();', errors: 1 },
            { code: 'await qb.getRawMany();', errors: 1 },
            { code: 'const qb = repo.createQueryBuilder("a"); await qb.getMany();', errors: 1 },
            { code: 'await repo.createQueryBuilder("a").stream();', errors: 1 },
            { code: 'await conn.query("SELECT id FROM t WHERE a = 1");', errors: 1 },
            { code: 'await conn.query(`SELECT id FROM t ${x}`);', errors: 1 },
            { code: '// unbounded-ok: todo\nawait repo.find({ where });', errors: 1 },
            { code: '// unbounded-ok:\nawait repo.find({ where });', errors: 1 },
            { code: '// unbounded-ok: needed\nawait repo.find({ where });', errors: 1 },
            {
                code: '// unbounded-ok: small table here\n\n\nawait repo.find({ where });',
                errors: 1,
            },
        ],
    },
);
