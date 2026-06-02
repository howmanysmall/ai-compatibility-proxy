#!/bin/zsh
set -eu

read -r request_line || exit 0

content_length=0
while IFS= read -r header_line; do
	if [[ "$header_line" == $'\r' || -z "$header_line" ]]; then
		break
	fi

	header_name=${header_line%%:*}
	header_value=${header_line#*:}
	header_name=${header_name:l}
	header_value=${header_value##[[:space:]]}
	header_value=${header_value%$'\r'}

	if [[ "$header_name" == "content-length" ]]; then
		content_length=$header_value
	fi
done

if [[ "$content_length" != "0" ]]; then
	dd bs=1 count="$content_length" of=/dev/null 2> /dev/null || true
fi

method=${request_line%% *}
rest=${request_line#* }
path=${rest%% *}

metadata_body='{"opencode":{"models":{"minimax-m3":{"provider":{"npm":"@ai-sdk/anthropic"}}},"npm":"@ai-sdk/openai-compatible"}}'
models_body='{"data":[{"created":0,"id":"minimax-m3","object":"model","owned_by":"opencode"}],"object":"list"}'
anthropic_body='{"content":[{"text":"pong","type":"text"}],"id":"msg_bench","model":"minimax-m3","stop_reason":"end_turn","type":"message","usage":{"input_tokens":8,"output_tokens":4}}'
openai_body='{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"pong","role":"assistant"}}],"created":0,"id":"chatcmpl_bench","model":"minimax-m3","object":"chat.completion"}'
not_found_body='{"error":"not found"}'

response_status='200 OK'
body=''

if [[ "$method" == 'GET' && "$path" == '/api.json' ]]; then
	body=$metadata_body
elif [[ "$method" == 'GET' && "$path" == '/v1/models' ]]; then
	body=$models_body
elif [[ "$method" == 'POST' && "$path" == '/v1/messages' ]]; then
	body=$anthropic_body
elif [[ "$method" == 'POST' && "$path" == '/v1/chat/completions' ]]; then
	body=$openai_body
else
	response_status='404 Not Found'
	body=$not_found_body
fi

body_bytes=${#body}

printf 'HTTP/1.1 %s\r\n' "$response_status"
printf 'Content-Type: application/json\r\n'
printf 'Cache-Control: no-store\r\n'
printf 'Connection: close\r\n'
printf 'Content-Length: %s\r\n' "$body_bytes"
printf '\r\n'
printf '%s' "$body"
