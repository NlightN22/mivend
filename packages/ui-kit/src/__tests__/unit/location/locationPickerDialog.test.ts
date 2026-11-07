// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import MvLocationPicker from '../../../components/MvLocationPicker/MvLocationPicker.vue';
import type { SearchMode } from '../../../components/MvLocationPicker/types';
import { makeStubAdapter } from './stubAdapter';

const config = {
    providers: [{ key: 'provider-a', publicKey: 'k' }, { key: 'open' }],
    defaultProvider: 'provider-a',
    defaultLatitude: 10,
    defaultLongitude: 20,
    defaultZoom: 5,
};

function build(searchMode?: SearchMode) {
    const adapter = makeStubAdapter();
    Object.assign(adapter, { searchMode });
    return mount(MvLocationPicker, {
        props: {
            modelValue: null,
            geoConfig: config,
            search: async () => [],
            reverse: async () => null,
            createAdapter: async () => adapter,
        },
        attachTo: document.body,
    });
}

const press = (key: string, shiftKey = false): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    return event;
};

afterEach(() => {
    document.body.innerHTML = '';
});

describe('MvLocationPicker dialog behaviour', () => {
    it('focuses into the dialog, labels it by its title, closes on Escape and restores focus', async () => {
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        const wrapper = build();
        await flushPromises();
        const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
        expect(dialog.contains(document.activeElement)).toBe(true);
        const title = document.getElementById(dialog.getAttribute('aria-labelledby')!);
        expect(title?.textContent).toBe('Pick location on map');
        expect(document.body.querySelector('.mv-loc__close')?.getAttribute('aria-label')).toBe(
            'Close',
        );
        press('Escape');
        expect(wrapper.emitted('close')).toHaveLength(1);
        wrapper.unmount();
        expect(document.activeElement).toBe(opener);
    });

    it('keeps Tab and Shift+Tab inside the dialog', async () => {
        const wrapper = build();
        await flushPromises();
        const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
        const items = [
            ...dialog.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input, [tabindex="0"]',
            ),
        ];
        items[items.length - 1].focus();
        expect(press('Tab').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(items[0]);
        expect(press('Tab', true).defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(items[items.length - 1]);
        wrapper.unmount();
    });

    it.each([
        ['native', true],
        ['host', true],
        ['host-submit', true],
        ['none', false],
    ] as const)('search box for mode %s is shown: %s', async (mode, shown) => {
        const wrapper = build(mode);
        await flushPromises();
        expect(document.body.querySelector('.mv-loc-search') !== null).toBe(shown);
        wrapper.unmount();
    });
});
