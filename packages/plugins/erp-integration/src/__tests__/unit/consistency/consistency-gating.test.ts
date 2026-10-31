import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_METADATA_KEY } from '@vendure/core';
import type { RequestContextService } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ConsistencyReportResolver } from '../../../consistency/consistency-report.resolver';
import { createConsistencyPollTask } from '../../../consistency/consistency-tasks';
import type { ErpIntegrationPluginOptions } from '../../../types';
import { CONFIG } from './consistency-fixtures';

describe('ConsistencyReportResolver @Allow gating', () => {
    it.each(['consistencyReports', 'consistencySources'])(
        '%s requires ManageErpIntegration',
        method => {
            const permissions = Reflect.getMetadata(
                PERMISSIONS_METADATA_KEY,
                ConsistencyReportResolver.prototype[method as keyof ConsistencyReportResolver],
            );
            expect(permissions).toEqual([CustomPermission.ManageErpIntegration.Permission]);
        },
    );
});

describe('consistency poll task gate', () => {
    const run = async (options: Partial<ErpIntegrationPluginOptions>): Promise<unknown> => {
        const pollAll = vi.fn(async () => []);
        const injector = { get: () => ({ pollAll }) as unknown as RequestContextService };
        const task = createConsistencyPollTask(options as ErpIntegrationPluginOptions);
        const result = await task.options.execute({ injector } as never);
        return { result, called: pollAll.mock.calls.length };
    };

    it('skips without sources and on a branch, polls on central with a source', async () => {
        expect(await run({ instanceType: 'central' })).toMatchObject({ called: 0 });
        expect(await run({ instanceType: 'branch', consistencySources: [CONFIG] })).toMatchObject({
            called: 0,
        });
        expect(await run({ instanceType: 'central', consistencySources: [CONFIG] })).toMatchObject({
            called: 1,
        });
    });
});
