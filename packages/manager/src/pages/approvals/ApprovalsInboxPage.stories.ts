import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { paginate, includesCi } from '../../../.storybook/mock-list-utils';
import ApprovalsInboxPage from './ApprovalsInboxPage.vue';

const meta: Meta<typeof ApprovalsInboxPage> = {
    title: 'Pages/Approvals/ApprovalsInboxPage',
    component: ApprovalsInboxPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ApprovalsInboxPage>;

interface ApprovalRequestMock {
    id: string;
    requestType: string;
    status: string;
    currentStepIndex: number;
    currentStepRole: string;
    stepRoles: string[];
    totalSteps: number;
    requestedByAdministratorId: string;
    createdAt: string;
    decidedAt: string | null;
    payload: string;
    steps: unknown[];
}

function request(
    id: string,
    requestType: string,
    status: string,
    currentStepRole: string,
): ApprovalRequestMock {
    return {
        id,
        requestType,
        status,
        currentStepIndex: 0,
        currentStepRole,
        stepRoles: [currentStepRole],
        totalSteps: 1,
        requestedByAdministratorId: '1',
        createdAt: new Date().toISOString(),
        decidedAt: status === 'pending' ? null : new Date().toISOString(),
        payload: '{}',
        steps: [],
    };
}

const REQUESTS = [
    request('1', 'discount-grant', 'pending', 'general-director'),
    request('2', 'priceAdjustmentApproval', 'pending', 'general-director'),
    request('3', 'discount-grant', 'approved', 'general-director'),
    request('4', 'priceAdjustmentApproval', 'rejected', 'general-director'),
];

interface ApprovalListOptions {
    skip?: number;
    take?: number;
    search?: string;
    requestType?: string;
    status?: string;
}

function filterRequests(items: typeof REQUESTS, options?: ApprovalListOptions): typeof REQUESTS {
    let filtered = items;
    if (options?.requestType)
        filtered = filtered.filter(r => r.requestType === options.requestType);
    if (options?.status) filtered = filtered.filter(r => r.status === options.status);
    if (options?.search) filtered = filtered.filter(r => includesCi(r.id, options.search!));
    return filtered;
}

function mockInboxData(): void {
    registerMock('TeamMembers', () => ({
        teamMembers: [{ id: '1', firstName: 'Alex', lastName: 'Manager', roleCodes: ['manager'] }],
    }));
    registerMock(
        'ApprovalsInbox',
        (variables: {
            awaitingOptions?: ApprovalListOptions;
            allInvolvedOptions?: ApprovalListOptions;
        }) => ({
            myApprovalsInbox: {
                awaitingMyDecision: paginate(
                    filterRequests(
                        REQUESTS.filter(r => r.status === 'pending'),
                        variables.awaitingOptions,
                    ),
                    variables.awaitingOptions,
                ),
                allInvolved: paginate(
                    filterRequests(REQUESTS, variables.allInvolvedOptions),
                    variables.allInvolvedOptions,
                ),
            },
        }),
    );
    registerMock('ApprovalCounterparties', () => ({
        counterparties: { items: [{ erpId: '1', shortName: 'customer-101' }] },
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockInboxData();
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
            registerMock('TeamMembers', () => ({ teamMembers: [] }));
            registerMock('ApprovalsInbox', () => ({
                myApprovalsInbox: {
                    awaitingMyDecision: { items: [], totalItems: 0 },
                    allInvolved: { items: [], totalItems: 0 },
                },
            }));
            registerMock('ApprovalCounterparties', () => ({ counterparties: { items: [] } }));
            await router.push('/approvals');
        },
    ],
    render: () => ({
        components: { ApprovalsInboxPage },
        template: '<ApprovalsInboxPage />',
    }),
};
