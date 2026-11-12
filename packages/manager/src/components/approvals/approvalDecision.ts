import type { ApprovalRequestDetail } from '../../api/approvals';
import { tr } from '../../utils/lazyLabels';

type Flags = Pick<
    ApprovalRequestDetail,
    'status' | 'viewerCanApprove' | 'viewerCanReject' | 'currentStepIndex' | 'currentStepRole'
>;

// Rejecting is allowed whenever the step permission holds, so approve-only refusal means the approval limit.
export function decisionDisabledReason(r: Flags): string {
    if (r.status !== 'pending' || (r.viewerCanApprove && r.viewerCanReject)) return '';
    if (r.viewerCanReject) return tr('approvals.decision.limitNotCovered');
    if (r.viewerCanApprove) return tr('approvals.decision.approveOnly');
    return tr('approvals.decision.notAllowed', {
        role: r.currentStepRole ?? tr('approvals.decision.currentApprover'),
        n: r.currentStepIndex + 1,
    });
}
