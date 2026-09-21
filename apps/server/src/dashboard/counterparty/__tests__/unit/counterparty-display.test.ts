import { describe, expect, it } from 'vitest';

import {
    formatBranch,
    formatLinkStatus,
    formatManager,
    UNASSIGNED_LABEL,
} from '../../counterparty-display';

describe('formatBranch', () => {
    it('returns the raw branchId when present', () => {
        expect(formatBranch('branch-a')).toBe('branch-a');
    });

    it('falls back to Unassigned when branchId is null/empty', () => {
        expect(formatBranch(null)).toBe(UNASSIGNED_LABEL);
        expect(formatBranch(undefined)).toBe(UNASSIGNED_LABEL);
        expect(formatBranch('')).toBe(UNASSIGNED_LABEL);
        expect(formatBranch('   ')).toBe(UNASSIGNED_LABEL);
    });
});

describe('formatManager', () => {
    const administrators = [{ erpId: 'EMP-001', name: 'Jane Doe' }];
    const erpUsers = [{ erpId: 'EMP-002', fullName: 'Ivan ERP-Only' }];

    it('shows the resolved Administrator name when managerErpId matches one', () => {
        expect(formatManager('EMP-001', administrators, erpUsers)).toBe('Jane Doe');
    });

    it('falls back to the ERP-reported ErpUser name when no Administrator matches', () => {
        expect(formatManager('EMP-002', administrators, erpUsers)).toBe('Ivan ERP-Only');
    });

    it('falls back to the raw managerErpId when neither resolves', () => {
        expect(formatManager('EMP-999', administrators, erpUsers)).toBe('EMP-999');
    });

    it('falls back to Unassigned when managerErpId is unset', () => {
        expect(formatManager(null, administrators, erpUsers)).toBe(UNASSIGNED_LABEL);
        expect(formatManager(undefined, administrators, erpUsers)).toBe(UNASSIGNED_LABEL);
    });
});

describe('formatLinkStatus', () => {
    it('reports erp-inactive when isActive is false, regardless of linkedCustomerId', () => {
        expect(formatLinkStatus('customer-1', false)).toBe('erp-inactive');
        expect(formatLinkStatus(null, false)).toBe('erp-inactive');
    });

    it('reports linked/unlinked from linkedCustomerId when active', () => {
        expect(formatLinkStatus('customer-1', true)).toBe('linked');
        expect(formatLinkStatus(null, true)).toBe('unlinked');
    });
});
