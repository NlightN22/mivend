import type { ApprovalRequestDetail } from '../../api/approvals';

type Flags = Pick<
    ApprovalRequestDetail,
    'status' | 'viewerCanApprove' | 'viewerCanReject' | 'currentStepIndex' | 'currentStepRole'
>;

// Rejecting is allowed whenever the step permission holds, so approve-only refusal means the approval limit.
export function decisionDisabledReason(r: Flags): string {
    if (r.status !== 'pending' || (r.viewerCanApprove && r.viewerCanReject)) return '';
    if (r.viewerCanReject) {
        return 'Your discount limit does not cover this request, so you can reject it but not approve it.';
    }
    if (r.viewerCanApprove) return 'You can approve this request but not reject it.';
    return `Only ${r.currentStepRole ?? 'the current approver'} (or the person this step was escalated to) can decide step ${r.currentStepIndex + 1}.`;
}
