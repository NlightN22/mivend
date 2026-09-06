// @vendure/dashboard only exposes its subpaths via package.json "exports" (no legacy flat
// files), which this project's plain "commonjs"/"node" tsconfig can't resolve — switching
// moduleResolution repo-wide to "bundler"/"node16" is a much bigger blast radius than this one
// import needs. ts-node-dev/Node's own runtime resolution reads "exports" fine; this ambient
// declaration only unblocks tsc.
declare module '@vendure/dashboard/plugin' {
    import { DashboardPlugin as ActualDashboardPlugin } from '@vendure/dashboard/dist/plugin/dashboard.plugin';
    export const DashboardPlugin: typeof ActualDashboardPlugin;
}
