import { describe, it, expect } from 'vitest';
import { buildSettingsNav } from '../../components/settings/settingsNav';

function labels(has: (permission: string) => boolean): string[] {
    return buildSettingsNav(has).flatMap(group => group.items.map(item => item.label));
}

describe('buildSettingsNav', () => {
    it('shows every section to a holder of all permissions, in three groups', () => {
        const groups = buildSettingsNav(() => true);
        expect(groups.map(g => g.label)).toEqual(['Access', 'Organization', 'System']);
        expect(groups.flatMap(g => g.items)).toHaveLength(13);
    });

    it('hides permission-gated sections and drops groups left empty', () => {
        expect(labels(() => false)).not.toContain('System health');
        expect(buildSettingsNav(() => false).map(g => g.label)).toEqual(['Access', 'Organization']);
    });

    it('shows System health to ManageAccessControl and to ManageErpIntegration alone', () => {
        expect(labels(p => p === 'ManageAccessControl')).toContain('System health');
        expect(labels(p => p === 'ManageErpIntegration')).toContain('System health');
    });

    it('shows the change journal only to ReadChangeJournal', () => {
        expect(labels(p => p === 'ReadChangeJournal')).toContain('Журнал изменений');
        expect(labels(() => false)).not.toContain('Журнал изменений');
    });

    it('gives each section a unique route', () => {
        const routes = buildSettingsNav(() => true).flatMap(g => g.items.map(i => i.to));
        expect(new Set(routes).size).toBe(routes.length);
    });
});
