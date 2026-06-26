import type { Meta, StoryObj } from '@storybook/vue3';
import MvButton from './MvButton.vue';
import type { ButtonVariant, ButtonSize } from './MvButton.vue';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'catalog', 'buy', 'ghost', 'danger'];
const SIZES: ButtonSize[] = ['sm', 'md', 'lg'];

const meta: Meta<typeof MvButton> = {
    title: 'Atoms/MvButton',
    component: MvButton,
    tags: ['autodocs'],
    argTypes: {
        variant: { control: 'select', options: VARIANTS },
        size: { control: 'select', options: SIZES },
        disabled: { control: 'boolean' },
        loading: { control: 'boolean' },
    },
    args: {
        variant: 'primary',
        size: 'md',
        disabled: false,
        loading: false,
    },
};

export default meta;
type Story = StoryObj<typeof MvButton>;

export const Default: Story = {
    args: { variant: 'primary' },
    render: args => ({
        components: { MvButton },
        setup: () => ({ args }),
        template: '<MvButton v-bind="args">Button</MvButton>',
    }),
};

export const AllVariants: Story = {
    render: () => ({
        components: { MvButton },
        setup: () => ({ variants: VARIANTS }),
        template: `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 24px;">
        <MvButton v-for="v in variants" :key="v" :variant="v">{{ v }}</MvButton>
      </div>
    `,
    }),
};

export const AllSizes: Story = {
    render: () => ({
        components: { MvButton },
        setup: () => ({ sizes: SIZES }),
        template: `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 24px;">
        <MvButton v-for="s in sizes" :key="s" variant="primary" :size="s">{{ s }}</MvButton>
      </div>
    `,
    }),
};

export const DisabledStates: Story = {
    render: () => ({
        components: { MvButton },
        setup: () => ({ variants: VARIANTS }),
        template: `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 24px;">
        <MvButton v-for="v in variants" :key="v" :variant="v" :disabled="true">{{ v }}</MvButton>
      </div>
    `,
    }),
};

export const LoadingStates: Story = {
    render: () => ({
        components: { MvButton },
        template: `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 24px;">
        <MvButton variant="primary" :loading="true">Searching</MvButton>
        <MvButton variant="buy" :loading="true">Adding to cart</MvButton>
        <MvButton variant="secondary" :loading="true">Loading</MvButton>
      </div>
    `,
    }),
};

export const LongText: Story = {
    render: () => ({
        components: { MvButton },
        template: `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 24px;">
        <MvButton variant="primary">Add all selected items to cart</MvButton>
        <MvButton variant="catalog">☰ All categories</MvButton>
        <MvButton variant="buy">Buy now — 2 940 ₽</MvButton>
      </div>
    `,
    }),
};
