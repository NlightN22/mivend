import { describe, expect, it } from 'vitest';
import { systemSettingsPath } from '../../components/layout/userMenuItems';

const granted =
    (...names: string[]) =>
    (name: string) =>
        names.includes(name);

describe('systemSettingsPath', () => {
    it('opens the settings root with ManageAccessControl', () => {
        expect(systemSettingsPath(granted('ManageAccessControl'))).toBe('/settings');
    });

    it('prefers the settings root when both permissions are granted', () => {
        const both = granted('ManageAccessControl', 'ManageVisibilityGrants');
        expect(systemSettingsPath(both)).toBe('/settings');
    });

    it('falls back to visibility grants with only ManageVisibilityGrants', () => {
        expect(systemSettingsPath(granted('ManageVisibilityGrants'))).toBe(
            '/settings/visibility-grants',
        );
    });

    it('opens Users with only ManageAdministratorLifecycle', () => {
        expect(systemSettingsPath(granted('ManageAdministratorLifecycle'))).toBe('/settings/users');
    });

    it('opens Integration health with only ReadExchangeHealth', () => {
        expect(systemSettingsPath(granted('ReadExchangeHealth'))).toBe(
            '/settings/integration-health',
        );
    });

    it('returns null with neither permission', () => {
        expect(systemSettingsPath(granted('ReadOrder'))).toBeNull();
    });
});
