import { describe, expect, it } from 'vitest';
import { decisionDisabledReason } from '../../components/approvals/approvalDecision';

const base = {
    status: 'pending',
    currentStepIndex: 0,
    currentStepRole: 'DepartmentHead',
    viewerCanApprove: true,
    viewerCanReject: true,
};

describe('decisionDisabledReason', () => {
    it('is empty when both actions are allowed or the request is decided', () => {
        expect(decisionDisabledReason(base)).toBe('');
        expect(
            decisionDisabledReason({ ...base, status: 'approved', viewerCanApprove: false }),
        ).toBe('');
    });

    it('explains a discount-limit refusal when only rejecting is allowed', () => {
        expect(decisionDisabledReason({ ...base, viewerCanApprove: false })).toContain(
            'discount limit does not cover',
        );
    });

    it('names the step role when the viewer may do neither', () => {
        expect(
            decisionDisabledReason({ ...base, viewerCanApprove: false, viewerCanReject: false }),
        ).toContain('DepartmentHead');
    });
});
