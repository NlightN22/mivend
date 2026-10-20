import { describe, expect, it } from 'vitest';

import {
    resolveCounterpartyBranch,
    resolveDepartmentBranch,
    subtreeOf,
} from '../../department-branch-resolver';

const tree = new Map<string, string | null>([
    ['root', null],
    ['dept-1', 'root'],
    ['dept-1a', 'dept-1'],
    ['dept-2', 'root'],
]);

describe('resolveDepartmentBranch', () => {
    it('uses the own mapping', () => {
        const mapping = new Map([['dept-1', 1]]);
        expect(resolveDepartmentBranch('dept-1', tree, mapping)).toEqual({
            branchId: 1,
            sourceDepartmentErpId: 'dept-1',
        });
    });

    it('inherits from the nearest mapped ancestor, own mapping beats a farther one', () => {
        const mapping = new Map([
            ['root', 9],
            ['dept-1', 1],
        ]);
        expect(resolveDepartmentBranch('dept-1a', tree, mapping)).toEqual({
            branchId: 1,
            sourceDepartmentErpId: 'dept-1',
        });
        expect(resolveDepartmentBranch('dept-2', tree, mapping)?.sourceDepartmentErpId).toBe(
            'root',
        );
    });

    it('is null when nothing on the chain is mapped, or the department is unknown or null', () => {
        const mapping = new Map([['dept-2', 2]]);
        expect(resolveDepartmentBranch('dept-1a', tree, mapping)).toBeNull();
        expect(resolveDepartmentBranch('unknown', tree, mapping)).toBeNull();
        expect(resolveDepartmentBranch(null, tree, mapping)).toBeNull();
    });

    it('follows a reparented department to its new ancestor', () => {
        const mapping = new Map([['dept-2', 2]]);
        const reparented = new Map(tree).set('dept-1a', 'dept-2');
        expect(resolveDepartmentBranch('dept-1a', reparented, mapping)?.branchId).toBe(2);
    });

    it('terminates on a cycle', () => {
        const cyclic = new Map<string, string | null>([
            ['a', 'b'],
            ['b', 'a'],
        ]);
        expect(resolveDepartmentBranch('a', cyclic, new Map())).toBeNull();
        expect(subtreeOf('a', cyclic)).toEqual(new Set(['a', 'b']));
    });
});

describe('subtreeOf', () => {
    it('contains the root and all descendants only', () => {
        expect(subtreeOf('dept-1', tree)).toEqual(new Set(['dept-1', 'dept-1a']));
    });
});

describe('resolveCounterpartyBranch', () => {
    const mapping = new Map([
        ['dept-1', 1],
        ['dept-2', 2],
    ]);
    const signals = { override: null, managerDepartmentErpId: null, ownDepartmentErpId: null };

    it('prefers the override, then the manager department, then the own department', () => {
        const both = { managerDepartmentErpId: 'dept-1', ownDepartmentErpId: 'dept-2' };
        expect(
            resolveCounterpartyBranch({ ...signals, ...both, override: '7' }, tree, mapping),
        ).toBe('7');
        expect(resolveCounterpartyBranch({ ...signals, ...both }, tree, mapping)).toBe('1');
        expect(
            resolveCounterpartyBranch({ ...signals, ownDepartmentErpId: 'dept-2' }, tree, mapping),
        ).toBe('2');
    });

    it('falls back to the own department when the manager department is unmapped', () => {
        const input = { ...signals, managerDepartmentErpId: 'root', ownDepartmentErpId: 'dept-2' };
        expect(resolveCounterpartyBranch(input, tree, mapping)).toBe('2');
    });

    it('is null with no signal (no default-branch fallback)', () => {
        expect(resolveCounterpartyBranch(signals, tree, mapping)).toBeNull();
    });
});
