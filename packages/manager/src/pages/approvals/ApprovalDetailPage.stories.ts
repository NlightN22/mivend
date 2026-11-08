import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import ApprovalDetailPage from './ApprovalDetailPage.vue';

// Docs page renders all stories at once, but each story loader pushes a different route
// on the shared router singleton, so the pushes collide and canvases show the last route.
const meta: Meta<typeof ApprovalDetailPage> = {
    title: 'Pages/Approvals/ApprovalDetailPage',
    component: ApprovalDetailPage,
};

export default meta;
type Story = StoryObj<typeof ApprovalDetailPage>;

function mockDetailData(overrides: Record<string, unknown> = {}): void {
    registerMock('TeamMembers', () => ({
        teamMembers: [{ id: '1', firstName: 'Alex', lastName: 'Manager', roleCodes: ['manager'] }],
    }));
    registerMock('ApprovalDetail', () => ({
        approvalRequest: {
            id: '1',
            requestType: 'priceAdjustmentApproval',
            status: 'pending',
            currentStepIndex: 0,
            currentStepRole: 'general-director',
            stepRoles: ['general-director'],
            totalSteps: 1,
            requestedByAdministratorId: '1',
            createdAt: new Date().toISOString(),
            decidedAt: null,
            payload: JSON.stringify({ orderId: '1', orderLineId: '1', requestedPrice: 200000 }),
            steps: [],
            escalatesTo: [],
            viewerCanApprove: true,
            viewerCanReject: true,
            ...overrides,
        },
    }));
    registerMock('ApprovalOrderReferences', () => ({
        visibleOrders: {
            items: [
                {
                    id: '1',
                    code: 'ORD-101',
                    customer: { firstName: 'Ivan', lastName: 'Petrov' },
                    lines: [
                        {
                            id: '1',
                            quantity: 2,
                            discountedUnitPriceWithTax: 200000,
                            productVariant: { name: 'Brake pad set', sku: 'SKU-001' },
                        },
                    ],
                },
            ],
        },
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockDetailData();
            await router.push('/approvals/1');
        },
    ],
    render: () => ({
        components: { ApprovalDetailPage },
        template: '<ApprovalDetailPage />',
    }),
};

export const NotFound: Story = {
    loaders: [
        async () => {
            registerMock('TeamMembers', () => ({ teamMembers: [] }));
            registerMock('ApprovalDetail', () => ({ approvalRequest: null }));
            await router.push('/approvals/999');
        },
    ],
    render: () => ({
        components: { ApprovalDetailPage },
        template: '<ApprovalDetailPage />',
    }),
};

export const CannotDecide: Story = {
    loaders: [
        async () => {
            mockDetailData({ viewerCanApprove: false, viewerCanReject: false });
            await router.push('/approvals/1');
        },
    ],
    render: Default.render,
};

export const Decided: Story = {
    loaders: [
        async () => {
            mockDetailData({
                status: 'approved',
                currentStepRole: null,
                decidedAt: new Date().toISOString(),
                viewerCanApprove: false,
                viewerCanReject: false,
                steps: [
                    {
                        id: '1',
                        stepIndex: 0,
                        requiredRole: 'general-director',
                        approverAdministratorId: '1',
                        wasEscalated: false,
                        escalatedByAdministratorId: null,
                        escalatedToAdministratorId: null,
                        decision: 'approved',
                        comment: 'Within the agreed margin',
                        decidedAt: new Date().toISOString(),
                    },
                ],
            });
            await router.push('/approvals/1');
        },
    ],
    render: Default.render,
};

export const Mobile: Story = {
    ...Default,
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};

export const ApproveLimitTooLow: Story = {
    loaders: [
        async () => {
            mockDetailData({ viewerCanApprove: false, viewerCanReject: true });
            await router.push('/approvals/1');
        },
    ],
    render: Default.render,
};
