// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MvBlockError from '../../components/MvBlockError/MvBlockError.vue';

const props = { title: 'This block could not load', message: 'Reason' };

describe('MvBlockError', () => {
    it('shows the title and the reason as an alert, without a retry button by default', () => {
        const wrapper = mount(MvBlockError, { props });
        expect(wrapper.attributes('role')).toBe('alert');
        expect(wrapper.text()).toContain('This block could not load');
        expect(wrapper.text()).toContain('Reason');
        expect(wrapper.find('button').exists()).toBe(false);
    });

    it('emits retry when the retry button is clicked', async () => {
        const wrapper = mount(MvBlockError, { props: { ...props, retryLabel: 'Retry' } });
        await wrapper.find('button').trigger('click');
        expect(wrapper.emitted('retry')).toHaveLength(1);
    });

    it('disables retry while retrying', () => {
        const wrapper = mount(MvBlockError, {
            props: { ...props, retryLabel: 'Retry', retrying: true },
        });
        expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    });
});
