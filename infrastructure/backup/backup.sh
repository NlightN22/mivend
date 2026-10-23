#!/usr/bin/env bash
# One-time setup of the borg backup on the production host, run from <stack dir>/backup as root.
# Needs: BORG_HOST, BORG_ACCOUNT (account name on the borg server), APPRISE_URL, BACKUP_HOSTNAME, and this
# host's /root/.ssh/id_ed25519.pub already in the account's authorized_keys.
# Safe to re-run: .env, the role and the repository are created only when missing.
set -euo pipefail

: "${BORG_HOST:?set BORG_HOST}" "${BORG_ACCOUNT:?set BORG_ACCOUNT}" "${APPRISE_URL:?set APPRISE_URL}" "${BACKUP_HOSTNAME:?set BACKUP_HOSTNAME}"
BK_DIR="$(cd "$(dirname "$0")" && pwd)"
STACK_DIR="$(dirname "$BK_DIR")"
BK_ENV="$BK_DIR/.env"
gen_secret() { openssl rand -hex 24; }

# One-shot commands bypass the image entrypoint (s6 /init): through it ${VARS} in the config cannot resolve.
bk() { docker compose --env-file "$BK_ENV" --project-directory "$BK_DIR" "$@"; }
bk_run() { bk run --rm --entrypoint borgmatic borgmatic "$@"; }
stack_env() { grep -m1 "^$1=" "$STACK_DIR/.env" | cut -d= -f2-; }

echo "--> SSH identity and known_hosts"
[ -f /root/.ssh/id_ed25519 ] || { echo "missing /root/.ssh/id_ed25519" >&2; exit 1; }
install -d -m 700 "$BK_DIR/ssh" "$BK_DIR/data"
install -m 600 /root/.ssh/id_ed25519 "$BK_DIR/ssh/id_ed25519"
ssh-keyscan -t ed25519,rsa "$BORG_HOST" 2>/dev/null >"$BK_DIR/ssh/known_hosts"
[ -s "$BK_DIR/ssh/known_hosts" ] || { echo "ssh-keyscan returned nothing for $BORG_HOST" >&2; exit 1; }
ssh -i "$BK_DIR/ssh/id_ed25519" -o BatchMode=yes -o UserKnownHostsFile="$BK_DIR/ssh/known_hosts" \
  "$BORG_ACCOUNT@$BORG_HOST" true || { echo "cannot log in as $BORG_ACCOUNT@$BORG_HOST" >&2; exit 1; }

echo "--> read-only database role and .env"
DB_NAME_VALUE="$(stack_env POSTGRES_DB)"
if [ ! -f "$BK_ENV" ]; then
  umask 077
  cat >"$BK_ENV" <<ENV
BACKUP_HOSTNAME=$BACKUP_HOSTNAME
ARCHIVE_PREFIX=${BACKUP_HOSTNAME//./-}
TZ=${TZ:-UTC}
BACKUP_CRON=${BACKUP_CRON:-32 4 * * *}
STACK_DIRECTORY=$STACK_DIR
BORG_REPOSITORY=ssh://$BORG_ACCOUNT@$BORG_HOST/./repo
BORG_PASSPHRASE=$(gen_secret)$(gen_secret)
APPRISE_URL=$APPRISE_URL
DB_NAME=$DB_NAME_VALUE
DB_USER=backup_ro
DB_PASSWORD=$(gen_secret)
ENV
  chmod 600 "$BK_ENV"
fi
DB_PASSWORD_VALUE="$(grep -m1 '^DB_PASSWORD=' "$BK_ENV" | cut -d= -f2-)"
docker compose --project-directory "$STACK_DIR" exec -T postgres psql -v ON_ERROR_STOP=1 \
  -U "$(stack_env POSTGRES_USER)" -d "$DB_NAME_VALUE" -v pw="$DB_PASSWORD_VALUE" <<'SQL' >/dev/null
SELECT format('CREATE ROLE backup_ro LOGIN') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_ro') \gexec
ALTER ROLE backup_ro PASSWORD :'pw';
GRANT pg_read_all_data TO backup_ro;
SQL

echo "--> validate, initialise repository, first backup"
bk pull borgmatic
bk_run config validate
bk_run repo-info >/dev/null 2>&1 || bk_run repo-create --encryption repokey-blake2
bk_run create --verbosity 1
bk up -d
echo "scheduled: $(grep -m1 '^BACKUP_CRON=' "$BK_ENV" | cut -d= -f2-); the passphrase is in $BK_ENV - copy it to the password manager"
