import { describe, it, expect } from 'vitest';
import { tradingPointDefectLabel } from '../../components/customers/tradingPointDefects';

describe('tradingPointDefectLabel', () => {
    it('names each defect code', () => {
        expect(tradingPointDefectLabel('NO_ADDRESS')).toBe('No address');
        expect(tradingPointDefectLabel('NO_LOCATION')).toBe('No coordinates');
        expect(tradingPointDefectLabel('INACTIVE')).toBe('Inactive');
    });

    it('shows an unknown code as is', () => {
        expect(tradingPointDefectLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    });
});
