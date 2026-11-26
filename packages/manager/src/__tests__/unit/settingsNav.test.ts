import { describe, it, expect } from 'vitest';
import { buildSettingsNav } from '../../components/settings/settingsNav';

function labels(has: (permission: string) => boolean): string[] {
    return buildSettingsNav(has).flatMap(group => group.items.map(item => item.label));
}

describe('buildSettingsNav', () => {
    it('shows every section to a holder of all permissions, in three groups', () => {
        const groups = buildSettingsNav(() => true);
        expect(groups.map(g => g.label)).toEqual(['Access', 'Organization', 'System']);
        expect(groups.flatMap(g => g.items)).toHaveLength(16);
    });

    it('hides permission-gated sections and drops groups left empty', () => {
        expect(labels(() => false)).not.toContain('System health');
        expect(buildSettingsNav(() => false)).toEqual([]);
    });

    it('shows only Users to a holder of ManageAdministratorLifecycle alone', () => {
        expect(labels(p => p === 'ManageAdministratorLifecycle')).toEqual(['Users']);
    });

    it('shows System health to ManageAccessControl and to ManageErpIntegration alone', () => {
        expect(labels(p => p === 'ManageAccessControl')).toContain('System health');
        expect(labels(p => p === 'ManageErpIntegration')).toContain('System health');
    });

    const EXCHANGE_HEALTH = [
        'Data drift reports',
        'ERP reconciliation',
        'Inbox issues',
        'Integration health',
        'Outbound problems',
    ];

    it('shows the five exchange health pages right after System health to ReadExchangeHealth alone', () => {
        const system = buildSettingsNav(p => p === 'ReadExchangeHealth');
        expect(system.map(g => g.label)).toEqual(['System']);
        expect(system[0].items.map(i => i.label)).toEqual(EXCHANGE_HEALTH);
        const all = buildSettingsNav(() => true).find(g => g.label === 'System')!;
        expect(all.items.slice(-6).map(i => i.label)).toEqual([
            'System health',
            ...EXCHANGE_HEALTH,
        ]);
    });

    it('shows the exchange health pages to ManageErpIntegration and hides them from other rights', () => {
        expect(labels(p => p === 'ManageErpIntegration')).toEqual(
            expect.arrayContaining(EXCHANGE_HEALTH),
        );
        expect(labels(p => p === 'ManageAdministratorLifecycle')).toEqual(['Users']);
        expect(labels(p => p === 'ManageAccessControl')).not.toContain('Inbox issues');
    });

    it('gives each section a unique route', () => {
        const routes = buildSettingsNav(() => true).flatMap(g => g.items.map(i => i.to));
        expect(new Set(routes).size).toBe(routes.length);
    });
});
