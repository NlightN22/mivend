import { formatDateTime } from '../../i18n/format';
import type { ApprovalRequestDetail } from '../../api/approvals';
import type { ManagerOption } from '../../api/orders';
import { managerName } from './approvalsListRows';

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
            title: 'Request submitted',
            meta: `by ${who(request.requestedByAdministratorId)}`,
            at: request.createdAt,
            comment: null,
        },
    ];
    request.stepRoles.forEach((role, index) => {
        const step = request.steps.find(s => s.stepIndex === index);
        const label = `Step ${index + 1} of ${request.totalSteps} · ${role}`;
        if (step?.wasEscalated) {
            items.push({
                key: `escalated-${index}`,
                state: 'escalated',
                title: `${label} escalated`,
                meta: `to ${who(step.escalatedToAdministratorId)} by ${who(step.escalatedByAdministratorId)}`,
                at: null,
                comment: null,
            });
        }
        if (step?.decision) {
            const approved = step.decision === 'approved';
            items.push({
                key: `decision-${index}`,
                state: approved ? 'done' : 'rejected',
                title: `${label} ${approved ? 'approved' : 'rejected'}`,
                meta: `by ${who(step.approverAdministratorId)}`,
                at: step.decidedAt,
                comment: step.comment,
            });
        } else if (request.status === 'pending' && index === request.currentStepIndex) {
            items.push({
                key: `current-${index}`,
                state: 'current',
                title: `${label} awaiting decision`,
                meta: '',
                at: null,
                comment: null,
            });
        } else if (request.status === 'pending' && index > request.currentStepIndex) {
            items.push({
                key: `upcoming-${index}`,
                state: 'upcoming',
                title: label,
                meta: 'not reached yet',
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
