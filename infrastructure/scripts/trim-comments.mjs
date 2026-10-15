#!/usr/bin/env node
// Shortens comments flagged by mivend/max-comment-lines. The model only returns replacement
// text; this script owns line ranges and indentation, so code can never be touched.
// Usage: node infrastructure/scripts/trim-comments.mjs [--apply] [--limit N] <path-prefix>...
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const prefixes = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--limit');
const root = resolve(import.meta.dirname, '../..');
const CONCURRENCY = 3;

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
const dirty = new Set(
    git('status', '--porcelain')
        .split('\n')
        .filter(Boolean)
        .map((l) => l.slice(3)),
);

function flagged() {
    let out;
    try {
        out = execFileSync(
            'pnpm',
            ['exec', 'eslint', ...(prefixes.length ? prefixes : ['.']), '-f', 'json'],
            { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 },
        );
    } catch (e) {
        out = e.stdout;
    }
    const byFile = new Map();
    for (const f of JSON.parse(out)) {
        for (const m of f.messages) {
            if (m.ruleId !== 'mivend/max-comment-lines') continue;
            const rel = f.filePath.slice(root.length + 1);
            if (dirty.has(rel)) continue;
            if (!byFile.has(rel)) byFile.set(rel, []);
            byFile.get(rel).push({ start: m.line, end: m.endLine });
        }
    }
    return byFile;
}

function ask(prompt) {
    return new Promise((res, rej) => {
        const p = spawn(
            'claude',
            ['-p', '--model', 'haiku', '--tools', '', '--no-session-persistence'],
            { cwd: tmpdir() },
        );
        let out = '';
        p.stdout.on('data', (d) => (out += d));
        p.on('close', (c) => (c === 0 ? res(out) : rej(new Error(`claude exit ${c}`))));
        p.stdin.end(prompt);
    });
}

const PROMPT = `You shorten over-long source code comments. For each numbered comment below, return a
replacement of AT MOST 2 lines (each line max 100 chars, plain text, no comment markers).
Rules: keep only the non-obvious WHY (hidden constraint, workaround, invariant). Drop narrative,
history, issue numbers, who-asked, and anything that restates what the code does. If nothing
non-obvious remains, return an empty array. Keep identifiers exact. Write English.
Output ONLY raw JSON: {"<n>": ["line1","line2"], ...} with every number present.

`;

async function processFile(rel, ranges) {
    const path = resolve(root, rel);
    const lines = readFileSync(path, 'utf8').split('\n');
    const items = ranges.filter((r) => /^\s*(\/\/|\/\*)/.test(lines[r.start - 1] ?? ''));
    if (!items.length) return 0;
    const body = items
        .map((r, i) => `#${i}\n${lines.slice(r.start - 1, r.end).join('\n')}`)
        .join('\n\n');
    const raw = await ask(PROMPT + body);
    const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const edits = items
        .map((r, i) => ({ r, rep: json[i] }))
        .filter((e) => Array.isArray(e.rep) && e.rep.length <= 2)
        .sort((a, b) => b.r.start - a.r.start);
    for (const { r, rep } of edits) {
        const indent = lines[r.start - 1].match(/^\s*/)[0];
        const clean = rep.map((t) => `${indent}// ${String(t).replace(/^\s*(\/\/|\/?\*+)\s?/, '')}`);
        lines.splice(r.start - 1, r.end - r.start + 1, ...clean);
    }
    if (apply && edits.length) writeFileSync(path, lines.join('\n'));
    return edits.length;
}

const files = [...flagged()].slice(0, limit);
console.log(`${files.length} files, ${apply ? 'APPLY' : 'dry-run'}`);
let done = 0;
let changed = 0;
const queue = [...files];
await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
            try {
                changed += await processFile(...job);
            } catch (e) {
                console.error(`skip ${job[0]}: ${e.message}`);
            }
            if (++done % 10 === 0) console.log(`${done}/${files.length}`);
        }
    }),
);
console.log(`comments rewritten: ${changed}${apply ? '' : ' (dry-run, nothing written)'}`);
