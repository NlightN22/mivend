import { describe, expect, it } from 'vitest';

import { CheckPolicyService } from '../../check-policy.service';
import { CheckRegistry } from '../../check-registry';
import { strongestConsequence } from '../../checks.service';
import type { CheckProvider, SubjectTypeDefinition } from '../../registry-types';

const subject: SubjectTypeDefinition = {
    type: 'thing',
    stages: ['draft', 'final'],
    allowedConsequences: ['info', 'warn', 'block'],
    loadSubject: async () => ({}),
    lockKey: ref => `thing:${ref}`,
    visibleSubjectIds: async (_c, ids) => new Set(ids),
};

function provider(over: Partial<CheckProvider> = {}): CheckProvider {
    return {
        code: 'x.check',
        subjectType: 'thing',
        stages: ['draft'],
        description: 'd',
        evaluate: () => [],
        ...over,
    };
}

describe('CheckRegistry', () => {
    it('rejects duplicate codes and duplicate subject types', () => {
        const registry = new CheckRegistry();
        registry.registerSubjectType(subject);
        registry.registerCheck(provider());
        expect(() => registry.registerCheck(provider())).toThrow(/already registered/);
        expect(() => registry.registerSubjectType(subject)).toThrow(/already registered/);
    });

    it('rejects a stage unknown to the subject type in either registration order', () => {
        const first = new CheckRegistry();
        first.registerSubjectType(subject);
        expect(() => first.registerCheck(provider({ stages: ['nope'] }))).toThrow(/unknown/);

        const second = new CheckRegistry();
        second.registerCheck(provider({ stages: ['nope'] }));
        expect(() => second.registerSubjectType(subject)).toThrow(/unknown/);
    });

    it('rejects a declared default the subject type does not allow', () => {
        const registry = new CheckRegistry();
        registry.registerSubjectType(subject);
        expect(() => registry.registerCheck(provider({ defaultConsequence: 'hold' }))).toThrow(
            /not allowed/,
        );
    });

    it('takes the per-stage default and validates it against the stage-specific allowed set', () => {
        const registry = new CheckRegistry();
        registry.registerSubjectType({ ...subject, stageConsequences: { final: ['hold'] } });
        const stageDefaults = { draft: 'info', final: 'hold' } as const;
        const p = provider({ stages: ['draft', 'final'], stageDefaults });
        registry.registerCheck(p);
        expect(registry.defaultConsequence(p, 'draft')).toBe('info');
        expect(registry.defaultConsequence(p, 'final')).toBe('hold');
        expect(() =>
            registry.registerCheck(
                provider({ code: 'y.check', stages: ['draft'], stageDefaults: { draft: 'hold' } }),
            ),
        ).toThrow(/not allowed/);
        expect(() =>
            registry.registerCheck(
                provider({ code: 'z.check', stages: ['draft'], stageDefaults: { final: 'info' } }),
            ),
        ).toThrow(/unused stage/);
    });

    it('resolves default enablement per stage, on when unspecified', () => {
        const registry = new CheckRegistry();
        const stages = ['draft', 'final'];
        expect(registry.defaultEnabled(provider({ stages }), 'draft')).toBe(true);
        expect(registry.defaultEnabled(provider({ stages, defaultEnabled: false }), 'final')).toBe(
            false,
        );
        const perStage = provider({ stages, defaultEnabled: { draft: false } });
        expect(registry.defaultEnabled(perStage, 'draft')).toBe(false);
        expect(registry.defaultEnabled(perStage, 'final')).toBe(true);
    });

    it('lists only providers of the stage and rejects an undefined stage', () => {
        const registry = new CheckRegistry();
        registry.registerSubjectType(subject);
        registry.registerCheck(provider({ code: 'a', stages: ['draft'] }));
        registry.registerCheck(provider({ code: 'b', stages: ['final'] }));
        registry.registerCheck(provider({ code: 'c', stages: ['draft', 'final'] }));
        expect(registry.listForStage('thing', 'draft').map(p => p.code)).toEqual(['a', 'c']);
        expect(() => registry.listForStage('thing', 'nope')).toThrow(/not defined/);
    });
});

describe('strongestConsequence', () => {
    it('is null without findings and picks the strongest otherwise', () => {
        expect(strongestConsequence([])).toBeNull();
        expect(
            strongestConsequence([
                { consequence: 'warn' },
                { consequence: 'block' },
                { consequence: 'hold' },
            ]),
        ).toBe('block');
        expect(strongestConsequence([{ consequence: 'info' }, { consequence: 'warn' }])).toBe(
            'warn',
        );
    });
});

describe('CheckPolicyService.update validation', () => {
    const registry = new CheckRegistry();
    registry.registerSubjectType(subject);
    registry.registerCheck(provider());
    const service = new CheckPolicyService(null as never, registry, null as never, null as never);
    const ctx = {} as never;

    it('rejects a consequence the subject type does not allow', async () => {
        await expect(
            service.update(ctx, {
                checkCode: 'x.check',
                stage: 'draft',
                consequence: 'hold',
                enabled: true,
            }),
        ).rejects.toThrow(/not allowed/);
    });

    it('rejects an unknown check and a stage the check does not run at', async () => {
        await expect(
            service.update(ctx, {
                checkCode: 'nope',
                stage: 'draft',
                consequence: 'warn',
                enabled: true,
            }),
        ).rejects.toThrow(/Unknown check/);
        await expect(
            service.update(ctx, {
                checkCode: 'x.check',
                stage: 'final',
                consequence: 'warn',
                enabled: true,
            }),
        ).rejects.toThrow(/does not run/);
    });
});
