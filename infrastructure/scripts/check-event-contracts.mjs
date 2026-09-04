#!/usr/bin/env node
// Guards against silently drifting from Integration Service's real @nlightn22/event-contracts
// contract (packages/plugins/erp-integration consumes it) — see docs/ai/1c-integration-service-
// decision.md's "Audit 2026-09-04" section for the real incident this exists to prevent: our
// pinned 0.5.0 was 8 versions behind upstream's 0.13.0, missing whole streams and carrying fields
// upstream had already removed, and nothing caught it until a manual audit.
//
// Compares the version pinned in packages/plugins/erp-integration/package.json against the
// latest version actually published on GitHub Packages. A patch/minor gap warns; a gap that
// crosses upstream's own breaking-change markers (checked via `pnpm view ... versions`, treating
// any release as potentially breaking since the package has no documented semver policy yet)
// beyond MAX_MINOR_DRIFT fails the check — this package's schemas are actively evolving and a
// large gap has already caused real field-shape bugs, not just a hypothetical staleness risk.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.resolve(__dirname, '../../packages/plugins/erp-integration');
const PACKAGE_NAME = '@nlightn22/event-contracts';
const MAX_MINOR_DRIFT = 2;

function readPinnedVersion() {
    const pkg = JSON.parse(readFileSync(path.join(PLUGIN_DIR, 'package.json'), 'utf-8'));
    const raw = pkg.dependencies?.[PACKAGE_NAME];
    if (!raw) {
        console.error(`${PACKAGE_NAME} not found in ${PLUGIN_DIR}/package.json dependencies`);
        process.exit(1);
    }
    return raw.replace(/^[\^~]/, '');
}

function fetchLatestVersion() {
    try {
        return execFileSync('pnpm', ['view', PACKAGE_NAME, 'version'], {
            cwd: PLUGIN_DIR,
            encoding: 'utf-8',
        }).trim();
    } catch (err) {
        console.warn(
            `WARN: could not reach GitHub Packages to check ${PACKAGE_NAME}'s latest version ` +
                `(no network, or //npm.pkg.github.com/:_authToken not configured on this machine — ` +
                `see .npmrc's own comment). Skipping the check, not failing the build.`,
        );
        console.warn(err.message);
        process.exit(0);
    }
}

function parseMinor(version) {
    const [major, minor] = version.split('.').map(Number);
    return { major, minor };
}

const pinned = readPinnedVersion();
const latest = fetchLatestVersion();

if (pinned === latest) {
    console.log(`${PACKAGE_NAME}@${pinned} is up to date with GitHub Packages.`);
    process.exit(0);
}

const p = parseMinor(pinned);
const l = parseMinor(latest);
const minorDrift = p.major === l.major ? l.minor - p.minor : Infinity;

if (minorDrift > MAX_MINOR_DRIFT) {
    console.error(
        `FAIL: ${PACKAGE_NAME} is pinned at ${pinned} but GitHub Packages has ${latest} — ` +
            `${minorDrift === Infinity ? 'a major-version' : `a ${minorDrift}-minor-version`} gap, ` +
            `over the ${MAX_MINOR_DRIFT}-minor threshold. Field shapes and streams likely changed ` +
            `(see docs/ai/1c-integration-service-decision.md's "Audit 2026-09-04"). Bump the ` +
            `dependency in packages/plugins/erp-integration/package.json, re-check every inbound/` +
            `outbound handler's field names against the new .proto, and re-run test-design before ` +
            `merging.`,
    );
    process.exit(1);
}

console.warn(
    `WARN: ${PACKAGE_NAME} is pinned at ${pinned}, GitHub Packages has ${latest}. Still within ` +
        `the ${MAX_MINOR_DRIFT}-minor drift threshold, not failing — but worth bumping soon.`,
);
process.exit(0);
