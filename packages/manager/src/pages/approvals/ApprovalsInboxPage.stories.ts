import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { mockApprovalsList } from '../../components/approvals/approvalsListMocks';
import ApprovalsInboxPage from './ApprovalsInboxPage.vue';

const meta: Meta<typeof ApprovalsInboxPage> = {
    title: 'Pages/Approvals/ApprovalsInboxPage',
    component: ApprovalsInboxPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ApprovalsInboxPage>;

export const Default: Story = {
    loaders: [
        async () => {
            mockApprovalsList();
            await router.push('/approvals');
        },
    ],
};

export const Empty: Story = {
    loaders: [
        async () => {
            mockApprovalsList([]);
            await router.push('/approvals');
        },
    ],
};

export const Mobile: Story = {
    ...Default,
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};
