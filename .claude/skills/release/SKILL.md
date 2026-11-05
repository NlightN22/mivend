---
name: release
description: Use for the whole path from finished work to a prod release - checks, audit before release, push by sha, version bump, image build, hand-off to deploy-prod, issue closing.
---

# Release workflow

Gate rules live in `AGENTS.md` ("Release gate — audit before release"); this skill is the order of steps, not a second copy of the rules.

## Steps

1. **Checks.** Run the `final-check` skill (`make lint`, `make test`, plus targeted `make test-int` / e2e groups for what changed). `make ci` runs only in the audit session. Commit locally, stage explicit paths only.
2. **Audit.** Send the commit range to the audit session (confirm its name via `ListAgents`). Relay its findings; fix CRITICAL/HIGH and re-audit the fixes.
3. **Collect the release set.** `git log <last version-bump commit>..HEAD` (there are no tags; same definition as `deploy-prod`) and `git log origin/main..HEAD` for other sessions' local commits: every commit needs an audit sign-off. Leave unaudited ones out. MEDIUM and above from the audit are fixed or explicitly accepted by the owner before release. Other sessions with commits for this release: agree on one owner and wait for each session's audit.
4. **Push by sha.** `git push origin <sha>:main`, never a blind `git push` of a shared tree. Rebase onto `origin/main` first.
5. **Version.** Check the prod `IMAGE_TAG` before choosing the number (a taken tag overwrites the registry). One commit that changes only the root `package.json` version. Run `pnpm build:plugins` before it.
6. **Push the bump** by sha (`git push origin <sha>:main`), then **build**: `gh workflow run docker-publish-apps.yml --ref main`, wait for green CI and images.
7. **Deploy.** Hand over to the `deploy-prod` skill; the owner must authorise the deploy in the chat. Pushing, building and closing issues (step 9) also happen only on the owner's direct request.
8. **Verify.** Services healthy, migrate exit 0, a read-only check of the changed behaviour on prod.
9. **Close.** `finish-task` for each linked issue (push, summary comment, close). Update `docs/ai/PROJECT_CONTEXT.md` when the release changes it.
