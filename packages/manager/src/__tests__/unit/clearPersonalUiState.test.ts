import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearPersonalUiState } from '../../composables/clearPersonalUiState';

const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
            store[key] = value;
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
        get length() {
            return Object.keys(store).length;
        },
        key: (i: number) => Object.keys(store)[i] ?? null,
    };
})();
vi.stubGlobal('localStorage', localStorageMock);

describe('clearPersonalUiState', () => {
    beforeEach(() => {
        localStorageMock.clear();
    });

    it('removes every key ending with :<administratorId>, regardless of table name', () => {
        localStorageMock.setItem('customer-orders-datatable-v2:42', '{}');
        localStorageMock.setItem('customer-invoices-datatable:42', '{}');
        localStorageMock.setItem('orders-datatable:42', '{}');

        clearPersonalUiState('42');

        expect(localStorageMock.getItem('customer-orders-datatable-v2:42')).toBeNull();
        expect(localStorageMock.getItem('customer-invoices-datatable:42')).toBeNull();
        expect(localStorageMock.getItem('orders-datatable:42')).toBeNull();
    });

    it("never touches another administrator's keys on a shared browser", () => {
        localStorageMock.setItem('customer-orders-datatable-v2:42', 'mine');
        localStorageMock.setItem('customer-orders-datatable-v2:99', 'someone-elses');

        clearPersonalUiState('42');

        expect(localStorageMock.getItem('customer-orders-datatable-v2:42')).toBeNull();
        expect(localStorageMock.getItem('customer-orders-datatable-v2:99')).toBe('someone-elses');
    });

    it('does nothing for an empty administratorId', () => {
        localStorageMock.setItem('customer-orders-datatable-v2:42', 'kept');
        clearPersonalUiState('');
        expect(localStorageMock.getItem('customer-orders-datatable-v2:42')).toBe('kept');
    });
});
