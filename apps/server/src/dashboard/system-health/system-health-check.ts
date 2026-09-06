// Re-exports packages/shared's checklist derivation under this module's existing names so
// index.ts and this directory's own test file don't need to change — see packages/shared's
// systemHealthChecklist.ts for the actual logic (shared with packages/manager's Settings >
// System health page, issue #76, so the two never drift out of sync with each other).
export {
    buildSystemHealthChecklist,
    getMissingSystemHealthChecks as getMissingChecks,
    type SystemHealthQueryResult,
    type SystemHealthCheckItem,
} from 'shared';
