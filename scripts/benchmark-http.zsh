#!/bin/zsh
set -euo pipefail

if ! command -v oha > /dev/null 2>&1; then
	print -u2 -- 'error: oha is required'
	exit 1
fi

if ! command -v socat > /dev/null 2>&1; then
	print -u2 -- 'error: socat is required'
	exit 1
fi

if ! command -v curl > /dev/null 2>&1; then
	print -u2 -- 'error: curl is required'
	exit 1
fi

BENCH_HOST=${BENCH_HOST:-127.0.0.1}
BENCH_PORT=${BENCH_PORT:-18000}
MOCK_UPSTREAM_PORT=${MOCK_UPSTREAM_PORT:-18080}
DURATION=${DURATION:-10s}
CONCURRENCY=${CONCURRENCY:-50}
WARMUP_REQUESTS=${WARMUP_REQUESTS:-5}
PAYLOAD_FILE=${PAYLOAD_FILE:-benchmarks/fixtures/chat-completions.json}
PROXY_BASE_URL="http://${BENCH_HOST}:${BENCH_PORT}"
MOCK_BASE_URL="http://${BENCH_HOST}:${MOCK_UPSTREAM_PORT}"
SCRIPT_DIR=${0:A:h}
REPO_ROOT=${SCRIPT_DIR:h}
MOCK_HANDLER=${SCRIPT_DIR}/mock-upstream-handler.zsh
mock_log=/tmp/ai-compatibility-proxy-mock-upstream.log
proxy_log=/tmp/ai-compatibility-proxy-proxy.log

cleanup() {
	local exit_code=$?
	if [[ -n ${proxy_pid:-} ]]; then
		kill ${proxy_pid} > /dev/null 2>&1 || true
		wait ${proxy_pid} > /dev/null 2>&1 || true
	fi
	if [[ -n ${mock_pid:-} ]]; then
		kill ${mock_pid} > /dev/null 2>&1 || true
		wait ${mock_pid} > /dev/null 2>&1 || true
	fi
	return ${exit_code}
}
trap cleanup EXIT INT TERM

cd ${REPO_ROOT}
chmod +x ${MOCK_HANDLER}

socat TCP-LISTEN:${MOCK_UPSTREAM_PORT},bind=${BENCH_HOST},reuseaddr,fork EXEC:${MOCK_HANDLER},pipes > ${mock_log} 2>&1 &
mock_pid=$!

until curl -fsS ${MOCK_BASE_URL}/api.json > /dev/null 2>&1; do
	sleep 0.1
done

env \
	PORT=${BENCH_PORT} \
	LOG_LEVEL=fatal \
	UPSTREAM_PROTOCOL=anthropic_messages \
	UPSTREAM_BASE_URL=${MOCK_BASE_URL}/v1 \
	OPENCODE_MODELS_URL=${MOCK_BASE_URL}/api.json \
	mise x -- nr dev > ${proxy_log} 2>&1 &
proxy_pid=$!

until curl -fsS ${PROXY_BASE_URL}/health > /dev/null 2>&1; do
	sleep 0.1
done

print -- ''
print -- '== Warmup =='
integer count=0
while ((count < WARMUP_REQUESTS)); do
	curl -fsS \
		-X POST \
		-H 'Authorization: Bearer upstream-key' \
		-H 'Content-Type: application/json' \
		--data-binary @${PAYLOAD_FILE} \
		${PROXY_BASE_URL}/v1/chat/completions > /dev/null
	((count += 1))
done

print -- ''
print -- '== GET /health =='
oha --no-tui -z ${DURATION} -c ${CONCURRENCY} ${PROXY_BASE_URL}/health

print -- ''
print -- '== GET /v1/models =='
oha --no-tui -z ${DURATION} -c ${CONCURRENCY} \
	-H 'Authorization: Bearer upstream-key' \
	${PROXY_BASE_URL}/v1/models

print -- ''
print -- '== POST /v1/chat/completions =='
oha --no-tui -z ${DURATION} -c ${CONCURRENCY} \
	-m POST \
	-H 'Authorization: Bearer upstream-key' \
	-H 'Content-Type: application/json' \
	-D ${PAYLOAD_FILE} \
	${PROXY_BASE_URL}/v1/chat/completions

print -- ''
print -- 'logs:'
print -- "  mock  ${mock_log}"
print -- "  proxy ${proxy_log}"
