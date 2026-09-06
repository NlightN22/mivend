// @vendure/dashboard only exposes its subpaths via package.json "exports" (no legacy flat
// files), which this project's plain "commonjs"/"node" tsconfig can't resolve — switching
// moduleResolution repo-wide to "bundler"/"node16" is a much bigger blast radius than this one
// import needs. ts-node-dev/Node's own runtime resolution reads "exports" fine; this ambient
// declaration only unblocks tsc.
//
// The deep import below (`@vendure/dashboard/dist/plugin/dashboard.plugin`) is NOT part of the
// package's public "exports" map — only "." / "./plugin" / "./vite" are. A semver-minor
// @vendure/dashboard bump could move/rename that internal file with no warning: tsc would keep
// compiling against this stale ambient type instead of failing, silently masking real drift.
// Re-check this file whenever @vendure/dashboard's version is bumped in apps/server/package.json.
declare module '@vendure/dashboard/plugin' {
    import { DashboardPlugin as ActualDashboardPlugin } from '@vendure/dashboard/dist/plugin/dashboard.plugin';
    export const DashboardPlugin: typeof ActualDashboardPlugin;
}
