import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvModal from './MvModal.vue';
import MvButton from '../MvButton/MvButton.vue';

const meta: Meta<typeof MvModal> = {
    title: 'Molecules/MvModal',
    component: MvModal,
    tags: ['autodocs'],
    argTypes: {
        title: { control: 'text' },
    },
    args: { title: 'Confirm order' },
};

export default meta;
type Story = StoryObj<typeof MvModal>;

export const Default: Story = {
    render: args => ({
        components: { MvModal },
        setup: () => ({ args }),
        template:
            '<MvModal v-bind="args"><p>Are you sure you want to confirm order-9001?</p></MvModal>',
    }),
};

export const Toggleable: Story = {
    render: () => ({
        components: { MvModal, MvButton },
        setup: () => {
            const open = ref(false);
            return { open };
        },
        template: `
      <div>
        <MvButton @click="open = true">Open modal</MvButton>
        <MvModal v-if="open" title="Delete price entry" @close="open = false">
          <p>This action cannot be undone.</p>
        </MvModal>
      </div>
    `,
    }),
};
