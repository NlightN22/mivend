---
name: release
description: Use for the whole path from finished work to a prod release - checks, audit before release, push by sha, version bump, image build, hand-off to deploy-prod, issue closing.
---

# Release workflow

Gate rules live in `AGENTS.md` ("Release gate — audit before release"); this skill is the order of steps, not a second copy of the rules.

## Steps

1. **Light checks.** Run the `final-check` skill (`make lint`, `make test`, plus `make test-int` for changed int tests). Heavy checks (e2e groups) do NOT run here. `make ci` runs only in the audit session. Commit locally, stage explicit paths only.
2. **Audit.** Send the commit range to the audit session (confirm its name via `ListAgents`). Relay its findings; fix CRITICAL/HIGH and re-audit the fixes. Audit comes before e2e: a finding changes the code, and every e2e run before that is wasted.
3. **Heavy checks.** After the audit has no open findings, run the targeted e2e groups (`make e2e-group G=<name>`) once on the final audited state and report the results to the audit session. Any change to non-test code made after the audit, including a fix for a failing e2e, goes back to the audit as a delta; changes only to e2e specs or fixtures stay with the author and are reported.
4. **Collect the release set.** `git log <last version-bump commit>..HEAD` (there are no tags; same definition as `deploy-prod`) and `git log origin/main..HEAD` for other sessions' local commits: every commit needs an audit sign-off. Leave unaudited ones out. MEDIUM and above from the audit are fixed or explicitly accepted by the owner before release. Other sessions with commits for this release: agree on one owner and wait for each session's audit.
5. **Push by sha.** `git push origin <sha>:main`, never a blind `git push` of a shared tree. Rebase onto `origin/main` first.
6. **Version.** Check the prod `IMAGE_TAG` before choosing the number (a taken tag overwrites the registry). One commit that changes only the root `package.json` version. Run `pnpm build:plugins` before it.
7. **Push the bump** by sha (`git push origin <sha>:main`), then **build**: `gh workflow run docker-publish-apps.yml --ref main`, wait for green CI and images.
8. **Deploy.** Hand over to the `deploy-prod` skill; the owner must authorise the deploy in the chat. Pushing, building and closing issues (step 10) also happen only on the owner's direct request.
9. **Verify.** Services healthy, migrate exit 0, a read-only check of the changed behaviour on prod.
10. **Close.** `finish-task` for each linked issue (push, summary comment, close). Update `docs/ai/PROJECT_CONTEXT.md` when the release changes it.
