// Workaround: tsc can't resolve exports-only subpaths; repo-wide moduleResolution change is overkill.
// Deep import is not in the exports map; a minor @vendure/dashboard bump can move it silently.
declare module '@vendure/dashboard/plugin' {
    import { DashboardPlugin as ActualDashboardPlugin } from '@vendure/dashboard/dist/plugin/dashboard.plugin';
    export const DashboardPlugin: typeof ActualDashboardPlugin;
}
