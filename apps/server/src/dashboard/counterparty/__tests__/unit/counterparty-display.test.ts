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
    const administrators = [{ id: 'admin-1', name: 'Jane Doe' }];

    it('shows the resolved Administrator name when assignedManagerId resolves', () => {
        expect(
            formatManager(
                { assignedManagerId: 'admin-1', managerErpId: 'EMP-001' },
                administrators,
            ),
        ).toBe('Jane Doe');
    });

    it('falls back to the raw managerErpId when assignedManagerId is unset/unresolved', () => {
        expect(
            formatManager({ assignedManagerId: null, managerErpId: 'EMP-001' }, administrators),
        ).toBe('EMP-001');
        expect(
            formatManager(
                { assignedManagerId: 'admin-unknown', managerErpId: 'EMP-001' },
                administrators,
            ),
        ).toBe('EMP-001');
    });

    it('falls back to Unassigned when neither is present', () => {
        expect(formatManager({ assignedManagerId: null, managerErpId: null }, administrators)).toBe(
            UNASSIGNED_LABEL,
        );
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
