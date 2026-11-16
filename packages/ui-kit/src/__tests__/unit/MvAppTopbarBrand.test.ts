// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MvAppTopbar from '../../components/MvAppTopbar/MvAppTopbar.vue';

const props = { userName: 'User', userInitials: 'U' };

beforeEach(() => {
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
    document.head.innerHTML = '';
});

describe('MvAppTopbar brand', () => {
    it('shows the configured site name and icon', () => {
        document.head.innerHTML =
            '<meta name="site-name" content="Acme Parts"><link rel="icon" href="/brand/icon.ico">';
        const wrapper = mount(MvAppTopbar, { props });
        expect(wrapper.text()).toContain('Acme Parts');
        expect(wrapper.find('img[src="/brand/icon.ico"]').exists()).toBe(true);
    });

    it('falls back to the default name only when none is set', () => {
        const wrapper = mount(MvAppTopbar, { props });
        expect(wrapper.text()).toContain('Shop');
    });
});
