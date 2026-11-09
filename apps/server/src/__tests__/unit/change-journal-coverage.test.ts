import { beforeAll, describe, expect, it, vi } from 'vitest';
import { coreEntitiesMap } from '@vendure/core/dist/entity/entities';
import { getEntitiesFromPlugins } from '@vendure/core/dist/plugin/plugin-metadata';
import { EXCLUDED_ENTITIES, JOURNALED_ENTITIES } from '@mivend/plugin-change-journal';

let registered: string[];

beforeAll(async () => {
    vi.stubEnv('INSTANCE_TYPE', 'central');
    vi.stubEnv('INSTANCE_NUMBER_CODE', '001');
    const { config } = await import('../../vendure-config');
    registered = [
        ...Object.keys(coreEntitiesMap),
        ...getEntitiesFromPlugins(config.plugins).map(e => e.name),
    ];
}, 60_000);

// #323: a new entity must be either journaled or excluded with a reason, never silently neither.
describe('change journal coverage', () => {
    it('every registered entity is journaled or excluded with a reason', () => {
        const decided = new Set([...JOURNALED_ENTITIES, ...Object.keys(EXCLUDED_ENTITIES)]);
        expect(registered.filter(name => !decided.has(name))).toEqual([]);
    });

    it('no entity is in both lists, and every exclusion has a reason', () => {
        expect(JOURNALED_ENTITIES.filter(name => name in EXCLUDED_ENTITIES)).toEqual([]);
        expect(Object.entries(EXCLUDED_ENTITIES).filter(([, reason]) => !reason.trim())).toEqual(
            [],
        );
    });

    it('the lists name only registered entities', () => {
        const known = new Set(registered);
        const stale = [...JOURNALED_ENTITIES, ...Object.keys(EXCLUDED_ENTITIES)].filter(
            name => !known.has(name),
        );
        expect(stale).toEqual([]);
    });
});
