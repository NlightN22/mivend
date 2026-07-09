import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';

import { buildApprovalMachine, stepIndexFromStateValue } from '../../approval-machine';
import { WorkflowStepDefinition } from '../../types';

const steps: WorkflowStepDefinition[] = [
    {
        order: 1,
        role: 'SalesDeptHead',
        requiredPermission: 'ApproveDiscountRequest',
        escalatesTo: ['GeneralDirector'],
    },
    {
        order: 2,
        role: 'PurchasingDeptHead',
        requiredPermission: 'ApproveDiscountRequest',
        escalatesTo: ['GeneralDirector'],
    },
    {
        order: 3,
        role: 'GeneralDirector',
        requiredPermission: 'ApproveDiscountRequest',
        escalatesTo: [],
    },
];

describe('buildApprovalMachine', () => {
    it('starts at step_0', () => {
        const actor = createActor(buildApprovalMachine(steps));
        actor.start();
        expect(actor.getSnapshot().value).toBe('step_0');
        actor.stop();
    });

    it('APPROVE advances to the next step, not the terminal state, before the last step', () => {
        const actor = createActor(buildApprovalMachine(steps));
        actor.start();
        actor.send({ type: 'APPROVE' });
        expect(actor.getSnapshot().value).toBe('step_1');
        actor.stop();
    });

    it('APPROVE on the last step reaches the "approved" terminal state', () => {
        const actor = createActor(buildApprovalMachine(steps));
        actor.start();
        actor.send({ type: 'APPROVE' });
        actor.send({ type: 'APPROVE' });
        actor.send({ type: 'APPROVE' });
        expect(actor.getSnapshot().value).toBe('approved');
        expect(actor.getSnapshot().status).toBe('done');
        actor.stop();
    });

    it('REJECT at any step reaches the "rejected" terminal state, never partially applies', () => {
        const actor = createActor(buildApprovalMachine(steps));
        actor.start();
        actor.send({ type: 'APPROVE' });
        actor.send({ type: 'REJECT' });
        expect(actor.getSnapshot().value).toBe('rejected');
        actor.stop();
    });

    it('rehydrates correctly from a persisted snapshot in a fresh actor', () => {
        const first = createActor(buildApprovalMachine(steps));
        first.start();
        first.send({ type: 'APPROVE' });
        const persisted = first.getPersistedSnapshot();
        first.stop();

        // A brand new actor, as would happen on the next HTTP request/decide() call.
        const rehydrated = createActor(buildApprovalMachine(steps), { snapshot: persisted });
        rehydrated.start();
        expect(rehydrated.getSnapshot().value).toBe('step_1');
        rehydrated.send({ type: 'APPROVE' });
        expect(rehydrated.getSnapshot().value).toBe('step_2');
        rehydrated.stop();
    });

    it('throws when given an empty step list rather than building an unusable machine', () => {
        expect(() => buildApprovalMachine([])).toThrow();
    });
});

describe('stepIndexFromStateValue', () => {
    it('parses step_N to N', () => {
        expect(stepIndexFromStateValue('step_0')).toBe(0);
        expect(stepIndexFromStateValue('step_12')).toBe(12);
    });

    it('returns null for terminal states', () => {
        expect(stepIndexFromStateValue('approved')).toBeNull();
        expect(stepIndexFromStateValue('rejected')).toBeNull();
    });
});
