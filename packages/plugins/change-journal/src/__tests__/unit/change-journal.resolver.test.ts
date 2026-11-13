import { ForbiddenError, PERMISSIONS_METADATA_KEY } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import type { EntityVersionScopeRegistry } from '@mivend/plugin-versioning';
import { describe, expect, it, vi } from 'vitest';

import { ChangeJournalResolver } from '../../api/change-journal.resolver';
import type { ChangeJournalService } from '../../change-journal.service';

const ctx = {} as RequestContext;
const PAGE = { items: [{ id: '1' }], totalItems: 1 };

function build(visible: boolean, scope: 'own' | 'department' | 'all') {
    const journal = {
        findForEntity: vi.fn().mockResolvedValue(PAGE),
        findFiltered: vi.fn().mockResolvedValue(PAGE),
    };
    const registry = {
        filterRefs: vi.fn(async (_: RequestContext, refs: unknown[]) => (visible ? refs : [])),
    };
    const access = { resolveCounterpartyScope: vi.fn(async () => ({ kind: scope })) };
    const resolver = new ChangeJournalResolver(
        journal as unknown as ChangeJournalService,
        registry as unknown as EntityVersionScopeRegistry,
        access as unknown as AccessScopeService,
    );
    return { journal, registry, resolver };
}

describe('ChangeJournalResolver', () => {
    it('both queries need ReadChangeJournal', () => {
        for (const name of ['changeJournalForEntity', 'changeJournal'] as const) {
            expect(
                Reflect.getMetadata(
                    PERMISSIONS_METADATA_KEY,
                    ChangeJournalResolver.prototype[name],
                ),
            ).toEqual([CustomPermission.ReadChangeJournal.Permission]);
        }
    });

    it('entries of a visible entity are returned', async () => {
        const { resolver, journal, registry } = build(true, 'own');
        const args = { entityType: 'TradingPoint', entityId: '5', take: 10 };
        expect(await resolver.changeJournalForEntity(ctx, args)).toEqual(PAGE);
        expect(registry.filterRefs).toHaveBeenCalledWith(ctx, [
            { entityName: 'TradingPoint', entityId: '5' },
        ]);
        expect(journal.findForEntity).toHaveBeenCalledWith(ctx, 'TradingPoint', '5', args, {});
    });

    it('passes the narrowing filter to the journal after the scope check', async () => {
        const { resolver, journal } = build(true, 'own');
        const filter = { actorType: 'acting' };
        await resolver.changeJournalForEntity(ctx, { entityType: 'Order', entityId: '1', filter });
        expect(journal.findForEntity).toHaveBeenCalledWith(
            ctx,
            'Order',
            '1',
            { entityType: 'Order', entityId: '1', filter },
            filter,
        );
    });

    it.each(['own', 'department', 'all'] as const)(
        'a hidden entity is refused for scope %s and never reaches the journal',
        async scope => {
            const { resolver, journal } = build(false, scope);
            const call = resolver.changeJournalForEntity(ctx, {
                entityType: 'Order',
                entityId: '1',
            });
            await expect(call).rejects.toBeInstanceOf(ForbiddenError);
            expect(journal.findForEntity).not.toHaveBeenCalled();
        },
    );

    it.each(['own', 'department'] as const)(
        'the cross-entity list is refused for scope %s',
        async scope => {
            const { resolver, journal } = build(true, scope);
            await expect(resolver.changeJournal(ctx, {})).rejects.toBeInstanceOf(ForbiddenError);
            expect(journal.findFiltered).not.toHaveBeenCalled();
        },
    );

    it('the cross-entity list is served for scope all', async () => {
        const { resolver, journal } = build(true, 'all');
        const filter = { actorType: 'acting' };
        expect(await resolver.changeJournal(ctx, { filter, take: 5 })).toEqual(PAGE);
        expect(journal.findFiltered).toHaveBeenCalledWith(ctx, filter, { filter, take: 5 });
    });
});
