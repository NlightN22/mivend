import type { Meta, StoryObj } from '@storybook/vue3';
import MvAvatar from './MvAvatar.vue';
import type { AvatarSize } from './MvAvatar.vue';

const SIZES: AvatarSize[] = ['sm', 'md', 'lg'];

const meta: Meta<typeof MvAvatar> = {
    title: 'Atoms/MvAvatar',
    component: MvAvatar,
    tags: ['autodocs'],
    argTypes: {
        size: { control: 'select', options: SIZES },
    },
    args: { name: 'Владислав Смирнов', size: 'md' },
};

export default meta;
type Story = StoryObj<typeof MvAvatar>;

export const Default: Story = {};

export const AllSizes: Story = {
    render: () => ({
        components: { MvAvatar },
        setup: () => ({ sizes: SIZES }),
        template: `
      <div style="display: flex; align-items: center; gap: 10px;">
        <MvAvatar v-for="s in sizes" :key="s" name="Владислав Смирнов" :size="s" />
      </div>
    `,
    }),
};
