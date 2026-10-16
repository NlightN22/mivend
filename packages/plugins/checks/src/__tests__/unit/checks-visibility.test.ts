import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CheckRegistry } from '../../check-registry';
import { ChecksService } from '../../checks.service';

const ctx = {} as RequestContext;

function setup(visible: string[] | null) {
    const registry = new CheckRegistry();
    registry.registerSubjectType({
        type: 'thing',
        stages: ['draft'],
        allowedConsequences: ['info', 'warn'],
        loadSubject: async () => ({}),
        lockKey: (ref: string) => `thing:${ref}`,
        ...(visible
            ? {
                  visibleSubjectIds: async (_c: RequestContext, ids: string[]) =>
                      new Set(ids.filter(i => visible.includes(i))),
              }
            : {}),
    } as never);
    const find = vi.fn(async () => [{ id: 1 }]);
    const connection = { getRepository: () => ({ find }) };
    return { find, service: new ChecksService(connection as never, registry, {} as never) };
}

describe('ChecksService.findResults visibility', () => {
    it('returns the stored rows of a subject the actor may see', async () => {
        const { service, find } = setup(['a']);
        expect(await service.findResults(ctx, 'thing', 'a')).toEqual([{ id: 1 }]);
        expect(find).toHaveBeenCalledTimes(1);
    });

    it('returns nothing, without reading rows, for a subject outside the actor scope', async () => {
        const { service, find } = setup(['a']);
        expect(await service.findResults(ctx, 'thing', 'b')).toEqual([]);
        expect(find).not.toHaveBeenCalled();
    });

    it('fails closed when the subject type declares no visibility rule', async () => {
        const { service, find } = setup(null);
        expect(await service.findResults(ctx, 'thing', 'b')).toEqual([]);
        expect(find).not.toHaveBeenCalled();
    });

    it('fails closed for an unknown subject type', async () => {
        const { service, find } = setup(['a']);
        expect(await service.findResults(ctx, 'nope', 'a')).toEqual([]);
        expect(find).not.toHaveBeenCalled();
    });
});
