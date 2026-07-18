import type { Meta, StoryObj } from '@storybook/vue3';
import MvWarningBanner from './MvWarningBanner.vue';

const meta: Meta<typeof MvWarningBanner> = {
    title: 'Molecules/MvWarningBanner',
    component: MvWarningBanner,
    tags: ['autodocs'],
    argTypes: {
        actionText: { control: 'text' },
        actionTo: { control: 'text' },
    },
};

export default meta;
type Story = StoryObj<typeof MvWarningBanner>;

export const Default: Story = {
    render: () => ({
        components: { MvWarningBanner },
        template: '<MvWarningBanner>3 discount grants expire this week.</MvWarningBanner>',
    }),
};

export const WithLinkAction: Story = {
    render: () => ({
        components: { MvWarningBanner },
        template: `
      <MvWarningBanner action-text="Review" action-to="/discounts">
        3 discount grants expire this week.
      </MvWarningBanner>
    `,
    }),
};

export const WithButtonAction: Story = {
    render: () => ({
        components: { MvWarningBanner },
        template: `
      <MvWarningBanner action-text="Dismiss" @action="() => {}">
        Some orders in branch-a need attention.
      </MvWarningBanner>
    `,
    }),
};
