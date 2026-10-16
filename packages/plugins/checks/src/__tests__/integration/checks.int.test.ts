import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    Column,
    CreateDateColumn,
    DataSource,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CheckPolicyService } from '../../check-policy.service';
import { CheckRegistry } from '../../check-registry';
import { CheckStaleRequestService } from '../../check-stale-request.service';
import { CheckStaleRequestWriter } from '../../check-stale-request.writer';
import { ChecksService } from '../../checks.service';
import type { CheckProvider } from '../../registry-types';

// VendureEntity needs a bootstrapped EntityIdStrategy, so plain mirrors on the real table shape
// stand in for the plugin entities (matched by class name in the connection shim below).
abstract class Base {
    @PrimaryGeneratedColumn() id!: number;
    @CreateDateColumn() createdAt!: Date;
    @UpdateDateColumn() updatedAt!: Date;
    @Column({ type: 'uuid', unique: true, default: () => 'gen_random_uuid()' }) uuid!: string;
}

@Entity('check_policy')
@Index('IDX_check_policy_global', ['checkCode', 'stage'], {
    unique: true,
    where: '"branchId" IS NULL',
})
@Index('IDX_check_policy_branch', ['checkCode', 'stage', 'branchId'], {
    unique: true,
    where: '"branchId" IS NOT NULL',
})
class CheckPolicy extends Base {
    @Column({ type: 'varchar' }) checkCode!: string;
    @Column({ type: 'varchar' }) stage!: string;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
    @Column({ type: 'varchar' }) consequence!: string;
    @Column({ type: 'varchar', nullable: true }) recipient!: string | null;
    @Column({ type: 'boolean', default: true }) enabled!: boolean;
}

@Entity('check_policy_history')
class CheckPolicyHistory extends Base {
    @Column({ type: 'int' }) checkPolicyId!: number;
    @Column({ type: 'varchar', nullable: true }) changedByUserId!: string | null;
    @Column({ type: 'jsonb' }) before!: unknown;
    @Column({ type: 'jsonb' }) after!: unknown;
}

@Entity('check_result')
class CheckResult extends Base {
    @Column({ type: 'varchar' }) subjectType!: string;
    @Column({ type: 'varchar' }) subjectId!: string;
    @Column({ type: 'varchar' }) checkCode!: string;
    @Column({ type: 'varchar', nullable: true }) stage!: string | null;
    @Column({ type: 'varchar', nullable: true }) lineRef!: string | null;
    @Column({ type: 'varchar' }) severity!: string;
    @Column({ type: 'varchar' }) messageKey!: string;
    @Column({ type: 'jsonb' }) facts!: unknown;
    @Column({ type: 'varchar', nullable: true }) dataVersion!: string | null;
    @Column({ type: 'timestamp' }) computedAt!: Date;
    @Column({ type: 'boolean', default: false }) stale!: boolean;
}

@Entity('branch')
class Branch extends Base {
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) name!: string;
}

@Entity('check_stale_request')
@Index(['kind', 'key'], { unique: true })
class CheckStaleRequest extends Base {
    @Column({ type: 'varchar' }) kind!: string;
    @Column({ type: 'varchar' }) key!: string;
    @Column({ type: 'int', default: 1 }) version!: number;
}

const mirrors: Record<string, unknown> = {
    Branch,
    CheckPolicy,
    CheckPolicyHistory,
    CheckResult,
    CheckStaleRequest,
};
const ctx = { activeUserId: 'user-1' } as unknown as RequestContext;
const { schema, extra } = testSchemaOptions('checks_framework');

let dataSource: DataSource;
let registry: CheckRegistry;
let policies: CheckPolicyService;
let checks: ChecksService;
let staleRequests: CheckStaleRequestService;
let calls: number;
let behaviour: { throwOnEvaluate: boolean; delayMs: number; severity: 'warning' | 'error' };

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [Branch, CheckPolicy, CheckPolicyHistory, CheckResult, CheckStaleRequest],
        synchronize: true,
    });
    await dataSource.initialize();
    const base = createTestConnection(dataSource);
    const connection = {
        rawConnection: dataSource,
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: unknown, entity: { name: string } | string) =>
            base.getRepository(
                c as never,
                typeof entity === 'string' ? entity : (mirrors[entity.name] as never),
            ),
    } as unknown as TransactionalConnection;

    registry = new CheckRegistry();
    registry.registerSubjectType<{ ref: string }>({
        type: 'thing',
        stages: ['draft', 'final'],
        allowedConsequences: ['info', 'warn', 'block'],
        stageConsequences: { final: ['require-approval'] },
        loadSubject: async (_c, ref) => ({ ref }),
        lockKey: ref => `thing:${ref}`,
        branchId: subject => (subject.ref.startsWith('b1-') ? '1' : null),
        visibleSubjectIds: async (_c, ids) => new Set(ids),
    });
    const provider: CheckProvider<{ ref: string }> = {
        code: 'demo.rule',
        subjectType: 'thing',
        stages: ['draft', 'final'],
        description: 'demo',
        evaluate: async subject => {
            calls++;
            await new Promise(r => setTimeout(r, behaviour.delayMs));
            if (behaviour.throwOnEvaluate) {
                throw new Error('boom');
            }
            return [
                {
                    severity: behaviour.severity,
                    lineRef: 'line-1',
                    facts: { needed: 5, ref: subject.ref },
                    messageKey: 'demo.short',
                },
            ];
        },
    };
    registry.registerCheck(provider);
    registry.registerSubjectType({
        type: 'other',
        stages: ['s'],
        allowedConsequences: ['info', 'warn'],
        loadSubject: async () => ({}),
        lockKey: () => 'other',
        visibleSubjectIds: async () => new Set(),
    });
    registry.registerCheck({
        ...provider,
        code: 'demo.optin',
        subjectType: 'other',
        stages: ['s'],
        defaultEnabled: false,
    });
    policies = new CheckPolicyService(
        connection,
        registry,
        { publish: published.push.bind(published) } as never,
        new CheckStaleRequestWriter(connection),
    );
    checks = new ChecksService(connection, registry, policies);
    staleRequests = new CheckStaleRequestService(
        connection,
        { create: async () => ctx } as never,
        checks,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    calls = 0;
    published.length = 0;
    behaviour = { throwOnEvaluate: false, delayMs: 0, severity: 'warning' };
    await dataSource.query(
        'TRUNCATE check_result, check_stale_request, check_policy_history, check_policy, branch RESTART IDENTITY',
    );
    await dataSource.query(
        `INSERT INTO branch ("erpId", name) VALUES ('e-1', 'One'), ('e-2', 'Two')`,
    );
});

const published: unknown[] = [];

const stored = (subjectId: string): Promise<{ stage: string; stale: boolean }[]> =>
    dataSource.query('SELECT stage, stale FROM check_result WHERE "subjectId" = $1', [subjectId]);

describe('checks framework (real Postgres)', () => {
    it('a branch override applies to that branch only and the global row stays the default', async () => {
        await policies.update(ctx, {
            checkCode: 'demo.rule',
            stage: 'draft',
            branchId: '1',
            consequence: 'block',
            enabled: true,
        });
        const branch = await checks.runChecks(ctx, 'thing', 'b1-a', 'draft');
        const other = await checks.runChecks(ctx, 'thing', 'z-a', 'draft');
        expect(branch.strongestConsequence).toBe('block');
        expect(other.strongestConsequence).toBe('warn');
        const rows = await dataSource.query(
            'SELECT "branchId", consequence FROM check_policy ORDER BY "branchId" NULLS FIRST',
        );
        expect(rows).toEqual([
            { branchId: null, consequence: 'warn' },
            { branchId: '1', consequence: 'block' },
        ]);
    });

    it('resetting an override returns the branch to the global row and is recorded', async () => {
        await policies.update(ctx, {
            checkCode: 'demo.rule',
            stage: 'draft',
            branchId: '1',
            consequence: 'block',
            enabled: true,
        });
        expect(await policies.resetOverride(ctx, 'demo.rule', 'draft', '1')).toBe(true);
        expect(await policies.resetOverride(ctx, 'demo.rule', 'draft', '1')).toBe(false);
        const run = await checks.runChecks(ctx, 'thing', 'b1-a', 'draft');
        expect(run.strongestConsequence).toBe('warn');
        const history = await dataSource.query(
            'SELECT after FROM check_policy_history ORDER BY id',
        );
        expect(history.at(-1).after).toEqual({ removed: true });
    });

    it('resolve reads the branch row, then the global row, then the provider default, creating nothing', async () => {
        expect(await policies.resolve(ctx, 'demo.rule', 'draft', '1')).toEqual({
            consequence: 'warn',
            enabled: true,
        });
        expect(await dataSource.query('SELECT 1 FROM check_policy')).toHaveLength(0);
        await policies.update(ctx, {
            checkCode: 'demo.rule',
            stage: 'draft',
            branchId: '1',
            consequence: 'info',
            enabled: false,
        });
        expect(await policies.resolve(ctx, 'demo.rule', 'draft', '1')).toEqual({
            consequence: 'info',
            enabled: false,
        });
        expect(await policies.resolve(ctx, 'demo.rule', 'draft', '2')).toEqual({
            consequence: 'warn',
            enabled: true,
        });
    });

    it('two concurrent first updates of one branch override end in exactly one row', async () => {
        const input = {
            checkCode: 'demo.rule',
            stage: 'draft',
            branchId: '1',
            consequence: 'info' as const,
            enabled: true,
        };
        await Promise.all([policies.update(ctx, input), policies.update(ctx, input)]);
        const rows = await dataSource.query(`SELECT 1 FROM check_policy WHERE "branchId" = '1'`);
        expect(rows).toHaveLength(1);
    });

    it('rejects an override for a branch that does not exist, a non-numeric id included', async () => {
        for (const branchId of ['99', 'branch-x']) {
            await expect(
                policies.update(ctx, {
                    checkCode: 'demo.rule',
                    stage: 'draft',
                    branchId,
                    consequence: 'info',
                    enabled: true,
                }),
            ).rejects.toThrow(/Unknown branch/);
        }
        expect(
            await dataSource.query('SELECT 1 FROM check_policy WHERE "branchId" IS NOT NULL'),
        ).toHaveLength(0);
    });

    it('a branch override that disables a blocking global row switches the control off for that branch only; deleting it returns to the global row; no row falls back to the provider default', async () => {
        await policies.update(ctx, {
            checkCode: 'demo.rule',
            stage: 'draft',
            consequence: 'block',
            enabled: true,
        });
        await policies.update(ctx, {
            checkCode: 'demo.rule',
            stage: 'draft',
            branchId: '1',
            consequence: 'block',
            enabled: false,
        });
        expect(await policies.resolve(ctx, 'demo.rule', 'draft', '1')).toEqual({
            consequence: 'block',
            enabled: false,
        });
        expect(await policies.resolve(ctx, 'demo.rule', 'draft', '2')).toEqual({
            consequence: 'block',
            enabled: true,
        });
        await policies.resetOverride(ctx, 'demo.rule', 'draft', '1');
        expect(await policies.resolve(ctx, 'demo.rule', 'draft', '1')).toEqual({
            consequence: 'block',
            enabled: true,
        });
        await dataSource.query('DELETE FROM check_policy');
        expect(await policies.resolve(ctx, 'demo.rule', 'draft', '1')).toEqual({
            consequence: 'warn',
            enabled: true,
        });
        expect(await policies.resolve(ctx, 'demo.optin', 's', '1')).toEqual({
            consequence: 'warn',
            enabled: false,
        });
    });

    it('a consequence allowed only at one stage is rejected elsewhere', async () => {
        await expect(
            policies.update(ctx, {
                checkCode: 'demo.rule',
                stage: 'draft',
                consequence: 'require-approval',
                enabled: true,
            }),
        ).rejects.toThrow(/not allowed/);
        await expect(
            policies.update(ctx, {
                checkCode: 'demo.rule',
                stage: 'final',
                consequence: 'require-approval',
                enabled: true,
            }),
        ).resolves.toBeTruthy();
    });

    it('creates the default policy lazily as warn and stores the result', async () => {
        const run = await checks.runChecks(ctx, 'thing', 'a', 'draft');
        expect(run.strongestConsequence).toBe('warn');
        expect(run.findings).toHaveLength(1);
        const rows = await dataSource.query('SELECT consequence, enabled FROM check_policy');
        expect(rows).toEqual([{ consequence: 'warn', enabled: true }]);
        expect(await stored('a')).toHaveLength(1);
    });

    it('a policy change alters the consequence with no code change', async () => {
        await checks.runChecks(ctx, 'thing', 'a', 'draft');
        await policies.update(ctx, {
            checkCode: 'demo.rule',
            stage: 'draft',
            consequence: 'block',
            enabled: true,
        });
        const run = await checks.runChecks(ctx, 'thing', 'a', 'draft');
        expect(run.strongestConsequence).toBe('block');
        const history = await dataSource.query(
            'SELECT before, after, "changedByUserId" FROM check_policy_history',
        );
        expect(history).toHaveLength(1);
        expect(history[0].before.consequence).toBe('warn');
        expect(history[0].after.consequence).toBe('block');
        expect(history[0].changedByUserId).toBe('user-1');
    });

    it('a disabled policy skips the check and clears its stored findings', async () => {
        await checks.runChecks(ctx, 'thing', 'a', 'draft');
        await policies.update(ctx, {
            checkCode: 'demo.rule',
            stage: 'draft',
            consequence: 'warn',
            enabled: false,
        });
        const run = await checks.runChecks(ctx, 'thing', 'a', 'draft');
        expect(run.findings).toEqual([]);
        expect(run.strongestConsequence).toBeNull();
        expect(await stored('a')).toHaveLength(0);
    });

    it('a policy change flags every stored result of that check as stale and announces it', async () => {
        await checks.runChecks(ctx, 'thing', 'a', 'draft');
        await checks.runChecks(ctx, 'thing', 'b', 'final');
        await policies.update(ctx, {
            checkCode: 'demo.rule',
            stage: 'draft',
            consequence: 'warn',
            recipient: 'ops',
            enabled: true,
        });
        await staleRequests.drain(ctx);
        expect((await stored('a')).every(r => !r.stale)).toBe(true);
        expect(published).toHaveLength(0);
        await policies.update(ctx, {
            checkCode: 'demo.rule',
            stage: 'draft',
            consequence: 'info',
            enabled: true,
        });
        expect((await stored('a')).every(r => !r.stale)).toBe(true);
        await staleRequests.drain(ctx);
        expect((await stored('a')).every(r => r.stale)).toBe(true);
        expect((await stored('b')).every(r => r.stale)).toBe(true);
        expect(await dataSource.query('SELECT 1 FROM check_stale_request')).toHaveLength(0);
        expect(published).toHaveLength(1);
    });

    it('a disabled policy leaves its old findings visibly out of date until the next run', async () => {
        await checks.runChecks(ctx, 'thing', 'a', 'draft');
        await policies.update(ctx, {
            checkCode: 'demo.rule',
            stage: 'draft',
            consequence: 'warn',
            enabled: false,
        });
        await staleRequests.drain(ctx);
        expect((await stored('a')).map(r => r.stale)).toEqual([true]);
    });

    it('a run in flight when the policy changes cannot leave fresh-looking old results', async () => {
        behaviour.delayMs = 150;
        const run = checks.runChecks(ctx, 'thing', 'a', 'draft');
        await new Promise(r => setTimeout(r, 40));
        await policies.update(ctx, {
            checkCode: 'demo.rule',
            stage: 'draft',
            consequence: 'info',
            enabled: true,
        });
        await run;
        await staleRequests.drain(ctx);
        expect((await stored('a')).every(r => r.stale)).toBe(true);
    });

    it('a policy update interleaved with a two-stage run in one transaction cannot deadlock', async () => {
        await policies.update(ctx, {
            checkCode: 'demo.rule',
            stage: 'final',
            consequence: 'warn',
            enabled: true,
        });
        const twoStages = (
            checks as unknown as { connection: TransactionalConnection }
        ).connection.withTransaction(ctx, async txCtx => {
            await checks.runChecks(txCtx, 'thing', 'a', 'draft');
            await new Promise(r => setTimeout(r, 300));
            await checks.runChecks(txCtx, 'thing', 'a', 'final');
        });
        await new Promise(r => setTimeout(r, 100));
        await policies.update(ctx, {
            checkCode: 'demo.rule',
            stage: 'final',
            consequence: 'info',
            enabled: true,
        });
        await twoStages;
        await staleRequests.drain(ctx);
        expect((await stored('a')).every(r => r.stale)).toBe(true);
    });

    it('unprocessable requests do not starve a processable one behind them', async () => {
        await dataSource.query(
            `INSERT INTO check_stale_request (kind, key) SELECT 'nohandler', g::text FROM generate_series(1, 120) g`,
        );
        const seen: string[] = [];
        staleRequests.registerHandler('late', async (_c, key) => void seen.push(key));
        await dataSource.query(`INSERT INTO check_stale_request (kind, key) VALUES ('late', 'k')`);

        await staleRequests.drain(ctx);

        expect(seen).toEqual(['k']);
        expect(await dataSource.query('SELECT 1 FROM check_stale_request')).toHaveLength(120);
    });

    it('keeps a check-code request when a result belongs to a subject type this process does not know', async () => {
        await dataSource.query(
            `INSERT INTO check_result ("subjectType", "subjectId", "checkCode", stage, severity, "messageKey", facts, "computedAt")
             VALUES ('ghost', 'g-1', 'demo.rule', 'draft', 'warning', 'x', '{}', now())`,
        );
        await dataSource.query(
            `INSERT INTO check_stale_request (kind, key) VALUES ('check-code', 'demo.rule')`,
        );

        await staleRequests.drain(ctx);

        expect(await dataSource.query('SELECT 1 FROM check_stale_request')).toHaveLength(1);
    });

    it('two drains in different processes do not work on the same request twice', async () => {
        const other = new CheckStaleRequestService(
            (staleRequests as unknown as { connection: TransactionalConnection }).connection,
            { create: async () => ctx } as never,
            checks,
        );
        let calls = 0;
        const handler = async (): Promise<void> => {
            calls += 1;
            await new Promise(r => setTimeout(r, 200));
        };
        staleRequests.registerHandler('slow', handler);
        other.registerHandler('slow', handler);
        await dataSource.query(`INSERT INTO check_stale_request (kind, key) VALUES ('slow', 'k')`);

        await Promise.all([staleRequests.drain(ctx), other.drain(ctx)]);

        expect(calls).toBe(1);
        expect(await dataSource.query('SELECT 1 FROM check_stale_request')).toHaveLength(0);
    });

    it('a pending stale request survives a failing handler and is retried', async () => {
        await checks.runChecks(ctx, 'thing', 'a', 'draft');
        let fail = true;
        staleRequests.registerHandler('flaky', async () => {
            if (fail) throw new Error('mark failed');
        });
        await dataSource.query(`INSERT INTO check_stale_request (kind, key) VALUES ('flaky', 'k')`);

        await staleRequests.drain(ctx);
        expect(await dataSource.query('SELECT 1 FROM check_stale_request')).toHaveLength(1);

        fail = false;
        await staleRequests.drain(ctx);
        expect(await dataSource.query('SELECT 1 FROM check_stale_request')).toHaveLength(0);
    });

    it('a rerun replaces results of its own stage only, and markStale flags the rest', async () => {
        await checks.runChecks(ctx, 'thing', 'a', 'draft');
        await checks.runChecks(ctx, 'thing', 'a', 'final');
        await checks.runChecks(ctx, 'thing', 'a', 'draft');
        expect(await stored('a')).toHaveLength(2);
        await checks.markStale(ctx, 'thing', 'a');
        expect((await stored('a')).every(r => r.stale)).toBe(true);
        await checks.runChecks(ctx, 'thing', 'a', 'draft');
        const rows = await stored('a');
        expect(rows.find(r => r.stage === 'draft')?.stale).toBe(false);
        expect(rows.find(r => r.stage === 'final')?.stale).toBe(true);
    });

    it('a throwing provider rolls back and keeps the previous stored results', async () => {
        await checks.runChecks(ctx, 'thing', 'a', 'draft');
        behaviour.throwOnEvaluate = true;
        await expect(checks.runChecks(ctx, 'thing', 'a', 'draft')).rejects.toThrow('boom');
        expect(await stored('a')).toHaveLength(1);
    });

    it('concurrent runs on one subject serialize and leave exactly one result set', async () => {
        behaviour.delayMs = 50;
        await Promise.all(
            Array.from({ length: 6 }, () => checks.runChecks(ctx, 'thing', 'a', 'draft')),
        );
        expect(calls).toBe(6);
        expect(await stored('a')).toHaveLength(1);
        const policyRows = await dataSource.query('SELECT 1 FROM check_policy');
        expect(policyRows).toHaveLength(1);
    });
});
