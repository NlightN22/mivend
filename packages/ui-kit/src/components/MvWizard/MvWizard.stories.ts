import type { Meta, StoryObj } from '@storybook/vue3';
import MvWizard from './MvWizard.vue';

const STEPS = [
    { key: 'select', label: 'Select records' },
    { key: 'parameters', label: 'Parameters' },
    { key: 'review', label: 'Review' },
    { key: 'run', label: 'Run' },
];

const meta: Meta<typeof MvWizard> = {
    title: 'Organisms/MvWizard',
    component: MvWizard,
    tags: ['autodocs'],
    args: { steps: STEPS, modelValue: 'parameters' },
};

export default meta;
type Story = StoryObj<typeof MvWizard>;

const render: Story['render'] = args => ({
    components: { MvWizard },
    setup: () => ({ args }),
    template: '<MvWizard v-bind="args"><p>Step content goes here.</p></MvWizard>',
});

export const Default: Story = { render };

export const NextDisabledWithReason: Story = {
    render,
    args: { modelValue: 'select', nextDisabledReason: 'Select at least one record' },
};

export const Busy: Story = { render, args: { modelValue: 'review', busy: true } };

export const LastStepWithoutNavigation: Story = {
    render,
    args: { modelValue: 'run', hideNext: true, hideBack: true },
};
