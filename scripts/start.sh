#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

PORT=5000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"

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


start_service() {
    cd "${COZE_WORKSPACE_PATH}"
    echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
    PORT=${DEPLOY_RUN_PORT} node dist/server.js
}

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
start_service
