import { createMachine, type AnyStateMachine } from 'xstate';

import { WorkflowStepDefinition } from './types';

// Pure builder: WorkflowDefinition.steps -> XState machine. Sequential steps only, no
// automatic parallelism (see docs/ai/manager-portal-concept.md §4.3). Escalation does not
// create a transition here — it only changes who is authorized to decide the current step
// (see ApprovalRequestService.canDecideStep), so it has no representation in the machine.
export function buildApprovalMachine(steps: WorkflowStepDefinition[]): AnyStateMachine {
    if (steps.length === 0) {
        throw new Error('WorkflowDefinition must have at least one step');
    }
    const orderedSteps = [...steps].sort((a, b) => a.order - b.order);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const states: Record<string, any> = {};
    orderedSteps.forEach((_step, index) => {
        const isLast = index === orderedSteps.length - 1;
        states[`step_${index}`] = {
            on: {
                APPROVE: { target: isLast ? 'approved' : `step_${index + 1}` },
                REJECT: { target: 'rejected' },
            },
        };
    });
    states.approved = { type: 'final' };
    states.rejected = { type: 'final' };

    return createMachine({
        id: 'approvalRequest',
        initial: 'step_0',
        states,
    }) as AnyStateMachine;
}

export function stepIndexFromStateValue(value: string): number | null {
    const match = /^step_(\d+)$/.exec(value);
    return match ? Number(match[1]) : null;
}
