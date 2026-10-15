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
@Index(['checkCode', 'stage'], { unique: true })
class CheckPolicy extends Base {
    @Column({ type: 'varchar' }) checkCode!: string;
    @Column({ type: 'varchar' }) stage!: string;
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

const mirrors: Record<string, unknown> = { CheckPolicy, CheckPolicyHistory, CheckResult };
const ctx = { activeUserId: 'user-1' } as unknown as RequestContext;
const { schema, extra } = testSchemaOptions('checks_framework');

let dataSource: DataSource;
let registry: CheckRegistry;
let policies: CheckPolicyService;
let checks: ChecksService;
let calls: number;
let behaviour: { throwOnEvaluate: boolean; delayMs: number; severity: 'warning' | 'error' };

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [CheckPolicy, CheckPolicyHistory, CheckResult],
        synchronize: true,
    });
    await dataSource.initialize();
    const base = createTestConnection(dataSource);
    const connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: unknown, entity: { name: string } | string) =>
            base.getRepository(
                c as never,
                typeof entity === 'string' ? entity : (mirrors[entity.name] as never),
            ),
    } as unknown as TransactionalConnection;

    registry = new CheckRegistry();
    registry.registerSubjectType({
        type: 'thing',
        stages: ['draft', 'final'],
        allowedConsequences: ['info', 'warn', 'block'],
        loadSubject: async (_c, ref) => ({ ref }),
        lockKey: ref => `thing:${ref}`,
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
    policies = new CheckPolicyService(connection, registry);
    checks = new ChecksService(connection, registry, policies);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    calls = 0;
    behaviour = { throwOnEvaluate: false, delayMs: 0, severity: 'warning' };
    await dataSource.query(
        'TRUNCATE check_result, check_policy_history, check_policy RESTART IDENTITY',
    );
});

const stored = (subjectId: string): Promise<{ stage: string; stale: boolean }[]> =>
    dataSource.query('SELECT stage, stale FROM check_result WHERE "subjectId" = $1', [subjectId]);

describe('checks framework (real Postgres)', () => {
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
