#!/usr/bin/env bash
# Prints 1 when a Playwright run may include the picker seed's only consumer (manager/acting), else 0: e2e-picker-seed.sh <playwright args>
roles='manager-(operator|manager|department-head|portal-admin)'
has_project=0 has_role=0 has_path=0
for a in "$@"; do
    case "$a" in
    *acting*) echo 1; exit 0 ;;
    --project=*) has_project=1; [[ "${a#--project=}" =~ ^$roles$ ]] && has_role=1 ;;
    -*) ;;
    *) has_path=1 ;;
    esac
done
if [ "$has_project" = 1 ] && { [ "$has_role" = 0 ] || [ "$has_path" = 1 ]; }; then echo 0; else echo 1; fi
