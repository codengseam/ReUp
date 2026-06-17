#!/bin/bash
set -Eeuo pipefail


PORT=8080
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-${PORT}}"


cd "${COZE_WORKSPACE_PATH}"

# macOS 上 Node.js 内置 CA 证书不含部分国内云服务商的 CA，
# 需加载系统证书库以避免 UNABLE_TO_GET_ISSUER_CERT_LOCALLY 错误
if [[ "$(uname)" == "Darwin" ]]; then
    _CERT_FILE="${TMPDIR:-/tmp}/node-extra-ca-$(id -u).pem"
    if [[ ! -f "${_CERT_FILE}" ]] || [[ $(( $(date +%s) - $(stat -f %m "${_CERT_FILE}") )) -gt 86400 ]]; then
        security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain > "${_CERT_FILE}" 2>/dev/null || true
    fi
    if [[ -f "${_CERT_FILE}" ]]; then
        export NODE_EXTRA_CA_CERTS="${_CERT_FILE}"
        echo "Loaded macOS system CA certs for Node.js."
    fi
fi

kill_port_if_listening() {
    local pids
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${DEPLOY_RUN_PORT}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -z "${pids}" ]]; then
      echo "Port ${DEPLOY_RUN_PORT} is free."
      return
    fi
    echo "Port ${DEPLOY_RUN_PORT} in use by PIDs: ${pids} (SIGKILL)"
    echo "${pids}" | xargs -I {} kill -9 {}
    sleep 1
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${DEPLOY_RUN_PORT}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -n "${pids}" ]]; then
      echo "Warning: port ${DEPLOY_RUN_PORT} still busy after SIGKILL, PIDs: ${pids}"
    else
      echo "Port ${DEPLOY_RUN_PORT} cleared."
    fi
}

echo "Clearing port ${DEPLOY_RUN_PORT} before start."
kill_port_if_listening
echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for dev..."

PORT=${DEPLOY_RUN_PORT} pnpm tsx watch src/server.ts
