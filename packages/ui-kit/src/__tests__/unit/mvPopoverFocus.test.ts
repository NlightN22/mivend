// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import MvPopover from '../../components/MvPopover/MvPopover.vue';

const ElPopoverStub = defineComponent({
    props: { visible: Boolean },
    setup:
        (props, { slots }) =>
        () =>
            h('div', [slots.reference?.(), props.visible ? slots.default?.() : null]),
});

function mountPopover(withAutofocus: boolean): VueWrapper {
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    return mount(
        defineComponent({
            components: { MvPopover },
            data: () => ({ open: false }),
            template: `<div><button id="other">other</button>
                <MvPopover v-model:open="open">
                    <template #trigger><button id="trigger">t</button></template>
                    <button id="first" ${withAutofocus ? 'data-popover-autofocus' : ''}>f</button>
                </MvPopover></div>`,
        }),
        { attachTo: document.body, global: { stubs: { ElPopover: ElPopoverStub } } },
    );
}

async function openMenu(wrapper: VueWrapper): Promise<void> {
    (wrapper.vm as unknown as { open: boolean }).open = true;
    await nextTick();
    await nextTick();
}

const press = (key: string): void => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key }));
};

describe('MvPopover focus', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    it('focuses the marked element on open and restores the trigger on Escape', async () => {
        const wrapper = mountPopover(true);
        const trigger = document.getElementById('trigger') as HTMLElement;
        trigger.focus();
        await openMenu(wrapper);
        expect(document.activeElement?.id).toBe('first');
        press('Escape');
        await nextTick();
        expect(document.activeElement).toBe(trigger);
        wrapper.unmount();
    });

    it('does not move focus on open without a marked element', async () => {
        const wrapper = mountPopover(false);
        const trigger = document.getElementById('trigger') as HTMLElement;
        trigger.focus();
        await openMenu(wrapper);
        expect(document.activeElement).toBe(trigger);
        wrapper.unmount();
    });

    it('leaves focus alone when it moved to another element before closing', async () => {
        const wrapper = mountPopover(true);
        document.getElementById('trigger')?.focus();
        await openMenu(wrapper);
        const other = document.getElementById('other') as HTMLElement;
        other.focus();
        (wrapper.vm as unknown as { open: boolean }).open = false;
        await nextTick();
        expect(document.activeElement).toBe(other);
        wrapper.unmount();
    });
});
