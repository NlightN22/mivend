import { formatDateTime } from '../../i18n/format';
import type { ApprovalRequestDetail } from '../../api/approvals';
import type { ManagerOption } from '../../api/orders';
import { managerName } from './approvalsListRows';
import { tr } from '../../utils/lazyLabels';

export type TimelineState = 'created' | 'done' | 'rejected' | 'escalated' | 'current' | 'upcoming';

export interface TimelineItem {
    key: string;
    state: TimelineState;
    title: string;
    meta: string;
    at: string | null;
    comment: string | null;
}

// Chronological build, reversed at the end: the newest event is shown first.
export function buildTimeline(
    request: ApprovalRequestDetail,
    managers: ManagerOption[],
): TimelineItem[] {
    const who = (id: string | null): string => managerName(managers, id);
    const items: TimelineItem[] = [
        {
            key: 'created',
            state: 'created',
            title: tr('approvals.timeline.submitted'),
            meta: tr('approvals.timeline.by', { name: who(request.requestedByAdministratorId) }),
            at: request.createdAt,
            comment: null,
        },
    ];
    request.stepRoles.forEach((role, index) => {
        const step = request.steps.find(s => s.stepIndex === index);
        const stepParams = { n: index + 1, total: request.totalSteps, role };
        if (step?.wasEscalated) {
            items.push({
                key: `escalated-${index}`,
                state: 'escalated',
                title: tr('approvals.timeline.escalated', stepParams),
                meta: tr('approvals.timeline.escalatedMeta', {
                    to: who(step.escalatedToAdministratorId),
                    by: who(step.escalatedByAdministratorId),
                }),
                at: null,
                comment: null,
            });
        }
        if (step?.decision) {
            const approved = step.decision === 'approved';
            items.push({
                key: `decision-${index}`,
                state: approved ? 'done' : 'rejected',
                title: tr(
                    approved ? 'approvals.timeline.approved' : 'approvals.timeline.rejected',
                    stepParams,
                ),
                meta: tr('approvals.timeline.by', { name: who(step.approverAdministratorId) }),
                at: step.decidedAt,
                comment: step.comment,
            });
        } else if (request.status === 'pending' && index === request.currentStepIndex) {
            items.push({
                key: `current-${index}`,
                state: 'current',
                title: tr('approvals.timeline.awaiting', stepParams),
                meta: '',
                at: null,
                comment: null,
            });
        } else if (request.status === 'pending' && index > request.currentStepIndex) {
            items.push({
                key: `upcoming-${index}`,
                state: 'upcoming',
                title: tr('approvals.timeline.step', stepParams),
                meta: tr('approvals.timeline.notReached'),
                at: null,
                comment: null,
            });
        }
    });
    return items.reverse();
}

export function formatWhen(iso: string): string {
    return formatDateTime(iso);
}
