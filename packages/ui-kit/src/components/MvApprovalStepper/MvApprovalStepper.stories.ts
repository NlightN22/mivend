import type { Meta, StoryObj } from '@storybook/vue3';
import MvApprovalStepper from './MvApprovalStepper.vue';
import type { ApprovalStepperItem } from './MvApprovalStepper.vue';

const IN_PROGRESS: ApprovalStepperItem[] = [
    { label: 'Sales manager', state: 'done', meta: 'Approved 2026-07-10' },
    { label: 'Branch lead', state: 'current' },
    { label: 'Finance', state: 'pending' },
];

const meta: Meta<typeof MvApprovalStepper> = {
    title: 'Organisms/MvApprovalStepper',
    component: MvApprovalStepper,
    tags: ['autodocs'],
    args: { steps: IN_PROGRESS },
};

export default meta;
type Story = StoryObj<typeof MvApprovalStepper>;

export const InProgress: Story = {
    render: args => ({
        components: { MvApprovalStepper },
        setup: () => ({ args }),
        template: '<MvApprovalStepper v-bind="args" />',
    }),
};

export const Rejected: Story = {
    args: {
        steps: [
            { label: 'Sales manager', state: 'done' },
            { label: 'Branch lead', state: 'rejected', meta: 'Rejected: over credit limit' },
            { label: 'Finance', state: 'pending' },
        ],
    },
    render: args => ({
        components: { MvApprovalStepper },
        setup: () => ({ args }),
        template: '<MvApprovalStepper v-bind="args" />',
    }),
};

export const Escalated: Story = {
    args: {
        steps: [
            { label: 'Sales manager', state: 'done' },
            { label: 'Branch lead', state: 'escalated', meta: 'Escalated after 48h' },
            { label: 'Finance', state: 'current' },
        ],
    },
    render: args => ({
        components: { MvApprovalStepper },
        setup: () => ({ args }),
        template: '<MvApprovalStepper v-bind="args" />',
    }),
};

export const AllDone: Story = {
    args: {
        steps: [
            { label: 'Sales manager', state: 'done' },
            { label: 'Branch lead', state: 'done' },
            { label: 'Finance', state: 'done' },
        ],
    },
    render: args => ({
        components: { MvApprovalStepper },
        setup: () => ({ args }),
        template: '<MvApprovalStepper v-bind="args" />',
    }),
};
