import { describe, expect, it } from 'vitest';
import { describeCondition } from '../../components/MvFilterBuilder/filterDescribe';
import { operatorLabel } from '../../components/MvFilterBuilder/filterOperators';
import type { FilterColumn } from '../../components/MvFilterBuilder/filterBuilderTypes';

const ru = (key: string, fallback: string): string =>
    ({ operator_contains: 'содержит', operatorSelect_eq: 'это' })[key] ?? fallback;
const text: FilterColumn = { key: 'name', label: 'Название', type: 'string' };
const select: FilterColumn = { key: 'state', label: 'Статус', type: 'select', options: [] };

describe('filter operator labels', () => {
    it('keeps the English text without a translation provider', () => {
        expect(operatorLabel(text, 'contains')).toBe('contains');
        expect(operatorLabel(select, 'eq')).toBe('is');
    });

    it('takes the app translation for text and select operators', () => {
        expect(operatorLabel(text, 'contains', ru)).toBe('содержит');
        expect(operatorLabel(select, 'eq', ru)).toBe('это');
    });

    it('falls back per operator when the app has no entry', () => {
        expect(operatorLabel(text, 'startsWith', ru)).toBe('starts with');
    });

    it('translates the operator inside a chip', () => {
        const chip = describeCondition(
            { columnKey: 'name', operator: 'contains', value: 'болт' },
            text,
            ru,
        );
        expect(chip).toBe('Название содержит болт');
    });
});
