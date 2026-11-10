// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MvDocumentTypeChip from '../../components/MvDocumentTypeChip/MvDocumentTypeChip.vue';
import {
    DEFAULT_DOCUMENT_TYPE_STYLE,
    resolveDocumentTypeStyle,
} from '../../components/MvDocumentTypeChip/documentTypeStyles';
import { ERP_DOCUMENT_TYPE_STYLES } from '../../components/MvDocumentTypeChip/erpDocumentTypeStyles';

describe('resolveDocumentTypeStyle', () => {
    it('prefers the ERP document type over its category', () => {
        const style = resolveDocumentTypeStyle('ПриходныйКассовыйОрдер', 'payment');
        expect(style).toBe(ERP_DOCUMENT_TYPE_STYLES.ПриходныйКассовыйОрдер);
        expect(style).not.toBe(resolveDocumentTypeStyle('payment'));
    });

    it('falls back to the category, then to the neutral default', () => {
        expect(resolveDocumentTypeStyle('БудущийДокумент', 'return')).toBe(
            resolveDocumentTypeStyle('return'),
        );
        expect(resolveDocumentTypeStyle('БудущийДокумент', 'other')).toBe(
            DEFAULT_DOCUMENT_TYPE_STYLE,
        );
        expect(resolveDocumentTypeStyle('БудущийДокумент')).toBe(DEFAULT_DOCUMENT_TYPE_STYLE);
    });
});

describe('MvDocumentTypeChip', () => {
    it('renders an unknown document type with the supplied label and its category icon', () => {
        const wrapper = mount(MvDocumentTypeChip, {
            props: { type: 'БудущийДокумент', category: 'sale', label: 'Новый документ' },
        });
        expect(wrapper.text()).toBe('Новый документ');
        expect(wrapper.find('svg').exists()).toBe(true);
    });
});
