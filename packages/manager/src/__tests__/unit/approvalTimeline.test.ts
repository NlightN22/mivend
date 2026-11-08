import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../../components/approvals/approvalTimeline';
import type { ApprovalRequestDetail } from '../../api/approvals';

const managers = [{ id: '1', name: 'Alex', email: 'a@example.com', roleCodes: [] }];

function request(patch: Partial<ApprovalRequestDetail>): ApprovalRequestDetail {
    return {
        id: '5',
        requestType: 'priceAdjustmentApproval',
        status: 'pending',
        currentStepIndex: 0,
        currentStepRole: 'DepartmentHead',
        stepRoles: ['DepartmentHead', 'GeneralDirector'],
        totalSteps: 2,
        requestedByAdministratorId: '1',
        createdAt: '2026-11-01T10:00:00Z',
        decidedAt: null,
        payload: '{}',
        steps: [],
        escalatesTo: [],
        viewerCanDecide: true,
        ...patch,
    };
}

describe('buildTimeline', () => {
    it('lists upcoming and current steps above the submission, newest first', () => {
        const keys = buildTimeline(request({}), managers).map(i => i.key);
        expect(keys).toEqual(['upcoming-1', 'current-0', 'created']);
    });

    it('shows a decision with its comment and moves on to the next step', () => {
        const items = buildTimeline(
            request({
                currentStepIndex: 1,
                currentStepRole: 'GeneralDirector',
                steps: [
                    {
                        id: 's',
                        stepIndex: 0,
                        requiredRole: 'DepartmentHead',
                        approverAdministratorId: '1',
                        wasEscalated: false,
                        escalatedByAdministratorId: null,
                        escalatedToAdministratorId: null,
                        decision: 'approved',
                        comment: 'ok',
                        decidedAt: '2026-11-02T10:00:00Z',
                    },
                ],
            }),
            managers,
        );
        expect(items.map(i => i.key)).toEqual(['current-1', 'decision-0', 'created']);
        expect(items[1]).toMatchObject({ state: 'done', comment: 'ok', meta: 'by Alex' });
    });

    it('has no open steps once the request is decided', () => {
        const items = buildTimeline(
            request({ status: 'rejected', currentStepRole: null }),
            managers,
        );
        expect(items.map(i => i.key)).toEqual(['created']);
    });
});
