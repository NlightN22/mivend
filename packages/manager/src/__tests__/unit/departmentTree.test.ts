import { describe, expect, it } from 'vitest';
import type { DepartmentBranchNode } from '../../api/departmentBranch';
import { flattenDepartmentTree, isUnmappedWithPeople } from '../../utils/departmentTree';

function node(
    id: string,
    parent: string | null,
    extra: Partial<DepartmentBranchNode> = {},
): DepartmentBranchNode {
    return {
        departmentErpId: id,
        name: id,
        parentErpId: parent,
        isActive: true,
        ownBranchId: null,
        effectiveBranchId: null,
        inheritedFromErpId: null,
        userCount: 0,
        counterpartyCount: 0,
        ...extra,
    };
}

describe('flattenDepartmentTree', () => {
    it('orders depth first with depth, siblings by name', () => {
        const rows = flattenDepartmentTree([
            node('b', 'root'),
            node('a1', 'a'),
            node('a', 'root'),
            node('root', null),
        ]);
        expect(rows.map(r => [r.departmentErpId, r.depth])).toEqual([
            ['root', 0],
            ['a', 1],
            ['a1', 2],
            ['b', 1],
        ]);
    });

    it('shows an orphan or cyclic node as a root without looping', () => {
        const rows = flattenDepartmentTree([node('x', 'missing'), node('p', 'q'), node('q', 'p')]);
        expect(rows.map(r => r.departmentErpId).sort()).toEqual(['p', 'q', 'x']);
    });
});

describe('isUnmappedWithPeople', () => {
    it('needs no effective branch and at least one user or counterparty', () => {
        expect(isUnmappedWithPeople(node('a', null, { userCount: 1 }))).toBe(true);
        expect(isUnmappedWithPeople(node('a', null))).toBe(false);
        expect(
            isUnmappedWithPeople(node('a', null, { userCount: 1, effectiveBranchId: '1' })),
        ).toBe(false);
    });
});
