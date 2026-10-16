import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
        return path.endsWith('.ts') ? [path] : [];
    });
}

// An order-line edit releases its reservation; the ERP integration must never turn that release into a command.
describe('erp-integration and reservation release events', () => {
    it('has no listener of ReservationReleasedEvent', () => {
        const offenders = sources(join(__dirname, '../..')).filter(file =>
            readFileSync(file, 'utf8').includes('ReservationReleasedEvent'),
        );
        expect(offenders).toEqual([]);
    });
});
