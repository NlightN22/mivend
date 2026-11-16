// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import MvMultiSelect from '../../components/MvMultiSelect/MvMultiSelect.vue';
import MvSearchSelect from '../../components/MvSelect/MvSearchSelect.vue';
import MvSelect from '../../components/MvSelect/MvSelect.vue';

const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India'];
const LONG = names.map(label => ({ value: label.toLowerCase(), label }));
const SHORT = LONG.slice(0, 3);

let wrapper: VueWrapper | null = null;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

const optionLabels = (): string[] =>
    Array.from(document.body.querySelectorAll('[data-testid="search-select-option"]')).map(
        el => el.textContent?.trim() ?? '',
    );
const type = async (text: string): Promise<void> => {
    const input = document.body.querySelector<HTMLInputElement>(
        '[data-testid="search-select-input"]',
    )!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await wrapper!.vm.$nextTick();
};
const openPanel = async (): Promise<void> => {
    await wrapper!.get('button.mv-search-select__trigger').trigger('click');
};

describe('MvSelect', () => {
    it('stays a native select for a short list', () => {
        wrapper = mount(MvSelect, { props: { modelValue: 'alpha', options: SHORT } });
        expect(wrapper.find('select').exists()).toBe(true);
        expect(wrapper.find('.mv-search-select__trigger').exists()).toBe(false);
    });

    it('becomes a searchable picker above eight options', () => {
        wrapper = mount(MvSelect, { props: { modelValue: 'alpha', options: LONG } });
        expect(wrapper.find('select').exists()).toBe(false);
        expect(wrapper.find('.mv-search-select__trigger').text()).toBe('Alpha');
    });

    it('puts aria-label and data-testid on the trigger button, not the wrapper', () => {
        wrapper = mount(MvSelect, {
            props: { modelValue: '', options: LONG },
            attrs: { 'aria-label': 'Branch', 'data-testid': 'quick-filter-branch' },
        });
        const trigger = wrapper.get('button.mv-search-select__trigger');
        expect(trigger.attributes('aria-label')).toBe('Branch');
        expect(trigger.attributes('data-testid')).toBe('quick-filter-branch');
        expect(wrapper.element.getAttribute('data-testid')).toBeNull();
    });

    it('relays the picked value from the searchable picker', async () => {
        wrapper = mount(MvSelect, {
            attachTo: document.body,
            props: { modelValue: '', options: LONG },
        });
        await openPanel();
        await type('golf');
        document.body.querySelector<HTMLElement>('[data-testid="search-select-option"]')!.click();
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('update:modelValue')).toEqual([['golf']]);
    });
});

describe('MvSearchSelect', () => {
    const mountOpen = async (modelValue = ''): Promise<void> => {
        wrapper = mount(MvSearchSelect, {
            attachTo: document.body,
            props: { modelValue, options: LONG },
        });
        await openPanel();
    };

    it('lists every option before anything is typed', async () => {
        await mountOpen();
        expect(optionLabels()).toEqual(names);
    });

    it('narrows the options case-insensitively as the user types', async () => {
        await mountOpen();
        await type('LL');
        expect(optionLabels()).toEqual([]);
        await type('O');
        expect(optionLabels()).toEqual(['Bravo', 'Echo', 'Foxtrot', 'Golf', 'Hotel']);
    });

    it('shows an empty message when nothing matches', async () => {
        await mountOpen();
        await type('zzz');
        expect(document.body.querySelector('[data-testid="search-select-empty"]')).not.toBeNull();
        expect(optionLabels()).toEqual([]);
    });

    it('picks the highlighted option with the keyboard and closes', async () => {
        await mountOpen();
        await type('del');
        const input = document.body.querySelector<HTMLInputElement>(
            '[data-testid="search-select-input"]',
        )!;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await wrapper!.vm.$nextTick();
        expect(wrapper!.emitted('update:modelValue')).toEqual([['delta']]);
        expect(document.body.querySelector('[data-testid="search-select-panel"]')).toBeNull();
    });

    it('resets the search when it is reopened', async () => {
        await mountOpen();
        await type('echo');
        await openPanel();
        await openPanel();
        expect(optionLabels()).toEqual(names);
    });

    it('renders no title element when no title is given', async () => {
        await mountOpen();
        expect(document.body.querySelector('.mv-search-select__title')).toBeNull();
    });

    it('marks the panel as nested so the filter builder does not close on a pick', async () => {
        await mountOpen();
        const panel = document.body.querySelector<HTMLElement>(
            '[data-testid="search-select-panel"]',
        )!;
        expect('mvNested' in panel.dataset).toBe(true);
    });
});

describe('MvMultiSelect search', () => {
    const labelsShown = (): string[] =>
        wrapper!.findAll('.mv-multi-select__option').map(l => l.text());

    it('has no search box for a short list', () => {
        wrapper = mount(MvMultiSelect, { props: { modelValue: [], options: SHORT } });
        expect(wrapper.find('[data-testid="multi-select-search"]').exists()).toBe(false);
    });

    it('narrows a long list and keeps the selection of hidden options', async () => {
        wrapper = mount(MvMultiSelect, { props: { modelValue: ['alpha'], options: LONG } });
        await wrapper.get('[data-testid="multi-select-search"]').setValue('golf');
        expect(labelsShown()).toEqual(['Golf']);
        await wrapper.get('input[type="checkbox"]').setValue(true);
        expect(wrapper.emitted('update:modelValue')).toEqual([[['alpha', 'golf']]]);
    });

    it('says so when nothing matches', async () => {
        wrapper = mount(MvMultiSelect, { props: { modelValue: [], options: LONG } });
        await wrapper.get('[data-testid="multi-select-search"]').setValue('zzz');
        expect(wrapper.find('[data-testid="multi-select-empty"]').exists()).toBe(true);
    });
});
