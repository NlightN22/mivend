// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import MvLocationPicker from '../../../components/MvLocationPicker/MvLocationPicker.vue';
import { makeStubAdapter, type StubAdapter } from './stubAdapter';

const config = {
    providers: [{ key: 'provider-a', publicKey: 'k' }, { key: 'open' }],
    defaultProvider: 'provider-a',
    defaultLatitude: 10,
    defaultLongitude: 20,
    defaultZoom: 5,
};

function build(adapter: StubAdapter, extra: Record<string, unknown> = {}) {
    return mount(MvLocationPicker, {
        props: {
            modelValue: null,
            geoConfig: config,
            search: async () => [{ address: 'Main St', latitude: 5, longitude: 6 }],
            reverse: async () => 'Main St 1',
            createAdapter: async () => adapter,
            ...extra,
        },
        attachTo: document.body,
    });
}

const saveButton = () =>
    [...document.body.querySelectorAll('button')].find(
        b => b.textContent?.trim() === 'Save',
    ) as HTMLButtonElement;

afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
});

describe('MvLocationPicker', () => {
    it('locks the body scroll while open, restores it on unmount, and gates Save on a point', async () => {
        document.body.style.overflow = 'auto';
        const adapter = makeStubAdapter();
        const wrapper = build(adapter);
        await flushPromises();
        expect(document.body.style.overflow).toBe('hidden');
        expect(saveButton().disabled).toBe(true);
        adapter.emit({ latitude: 11, longitude: 21 });
        await flushPromises();
        expect(saveButton().disabled).toBe(false);
        expect(document.body.textContent).toContain('11.000000, 21.000000');
        expect(document.body.textContent).toContain('Main St 1');
        saveButton().click();
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([
            { latitude: 11, longitude: 21 },
        ]);
        wrapper.unmount();
        expect(document.body.style.overflow).toBe('auto');
    });

    it('shows retry and manual inputs when the provider fails, and Save works afterwards', async () => {
        const wrapper = build(makeStubAdapter({ failMount: true }));
        await flushPromises();
        expect(document.body.textContent).toContain('The map could not be loaded.');
        const inputs = document.body.querySelectorAll<HTMLInputElement>('.mv-loc-manual input');
        inputs[0].value = '48.1';
        inputs[0].dispatchEvent(new Event('input'));
        inputs[1].value = '11.5';
        inputs[1].dispatchEvent(new Event('input'));
        document.body.querySelector('.mv-loc-manual')!.dispatchEvent(new Event('submit'));
        await flushPromises();
        expect(saveButton().disabled).toBe(false);
        wrapper.unmount();
    });

    it('uses labels overrides and switches providers from the top-right switcher', async () => {
        const adapter = makeStubAdapter();
        const wrapper = build(adapter, { labels: { save: 'Сохранить' } });
        await flushPromises();
        expect(document.body.textContent).toContain('Сохранить');
        const open = [
            ...document.body.querySelectorAll<HTMLButtonElement>('.mv-loc-switch__btn'),
        ].find(b => b.textContent?.trim() === 'open')!;
        open.click();
        await flushPromises();
        expect(adapter.destroy).toHaveBeenCalled();
        wrapper.unmount();
    });
});
