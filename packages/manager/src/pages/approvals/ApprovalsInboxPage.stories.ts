import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import ApprovalsInboxPage from './ApprovalsInboxPage.vue';

const meta: Meta<typeof ApprovalsInboxPage> = {
    title: 'Pages/Approvals/ApprovalsInboxPage',
    component: ApprovalsInboxPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ApprovalsInboxPage>;

const REQUEST_SUMMARY = {
    id: '1',
    requestType: 'discount-grant',
    status: 'pending',
    currentStepIndex: 0,
    currentStepRole: 'general-director',
    stepRoles: ['general-director'],
    totalSteps: 1,
    requestedByAdministratorId: '1',
    createdAt: new Date().toISOString(),
    decidedAt: null,
    payload: '{}',
    steps: [],
};

function mockInboxData(items: (typeof REQUEST_SUMMARY)[], totalItems: number): void {
    registerMock('TeamMembers', () => ({
        teamMembers: [{ id: '1', firstName: 'Alex', lastName: 'Manager', roleCodes: ['manager'] }],
    }));
    registerMock('ApprovalsInbox', () => ({
        myApprovalsInbox: {
            awaitingMyDecision: { items, totalItems },
            allInvolved: { items, totalItems },
        },
    }));
    registerMock('ApprovalCounterparties', () => ({
        counterparties: { items: [{ erpId: '1', shortName: 'customer-123' }] },
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockInboxData(
                [
                    REQUEST_SUMMARY,
                    { ...REQUEST_SUMMARY, id: '2', requestType: 'priceAdjustmentApproval' },
                ],
                2,
            );
            await router.push('/approvals');
        },
    ],
    render: () => ({
        components: { ApprovalsInboxPage },
        template: '<ApprovalsInboxPage />',
    }),
};

export const Empty: Story = {
    loaders: [
        async () => {
            mockInboxData([], 0);
            await router.push('/approvals');
        },
    ],
    render: () => ({
        components: { ApprovalsInboxPage },
        template: '<ApprovalsInboxPage />',
    }),
};
