#!/bin/sh
set -eu
# The command is passed as ONE argument, never evaluated as shell code.
case "${SSH_ORIGINAL_COMMAND:-}" in
  'deploy '*|rollback|status)
    exec /usr/bin/sudo -n /usr/local/sbin/four-winds-release "$SSH_ORIGINAL_COMMAND" ;;
  *) echo 'This key only permits deploy, rollback, and status.' >&2; exit 1 ;;
esac
