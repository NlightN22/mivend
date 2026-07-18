import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import ApprovalDetailPage from './ApprovalDetailPage.vue';

// No 'autodocs': the combined Docs page renders every story's canvas at once, and each story's
// loader pushes a different route on the shared router singleton — the pushes collide and every
// canvas ends up on whichever route won last (see individual story canvases instead).
const meta: Meta<typeof ApprovalDetailPage> = {
    title: 'Pages/Approvals/ApprovalDetailPage',
    component: ApprovalDetailPage,
};

export default meta;
type Story = StoryObj<typeof ApprovalDetailPage>;

function mockDetailData(): void {
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
                            unitPriceWithTax: 200000,
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
