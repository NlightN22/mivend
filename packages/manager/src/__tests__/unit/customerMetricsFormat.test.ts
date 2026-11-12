import { describe, expect, it } from 'vitest';
import {
    balanceCaption,
    contractLabel,
    dynamicsText,
} from '../../components/customers/customerMetricsFormat';

describe('dynamicsText', () => {
    it('shows signed percent against the previous window', () => {
        expect(dynamicsText(112, 100)).toBe('+12% vs previous 30 days');
        expect(dynamicsText(50, 100)).toBe('-50% vs previous 30 days');
        expect(dynamicsText(100, 100)).toBe('0% vs previous 30 days');
    });

    it('says new when the earlier window is empty and nothing when both are', () => {
        expect(dynamicsText(10, 0)).toBe('new');
        expect(dynamicsText(0, 0)).toBeNull();
    });
});

describe('balanceCaption and contractLabel', () => {
    it('names the direction of the debt', () => {
        expect(balanceCaption(1)).toBe('Customer owes us');
        expect(balanceCaption(-1)).toBe('We owe the customer');
        expect(balanceCaption(0)).toBe('Settled');
    });

    it('falls back to the ERP id for a contract that is not imported', () => {
        expect(contractLabel({ contractName: 'Main', contractErpId: 'x' })).toBe('Main');
        expect(contractLabel({ contractName: null, contractErpId: 'ct-9' })).toBe('ct-9');
        expect(contractLabel({ contractName: null, contractErpId: '' })).toBe('No contract');
    });
});
