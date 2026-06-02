const host = Deno.env.get("BENCH_HOST") ?? "127.0.0.1";
const port = Number(Deno.env.get("MOCK_UPSTREAM_PORT") ?? "18080");

const jsonHeaders = {
	"cache-control": "no-store",
	"content-type": "application/json",
};

const metadataResponse = {
	opencode: {
		models: {
			"minimax-m3": { provider: { npm: "@ai-sdk/anthropic" } },
		},
		npm: "@ai-sdk/openai-compatible",
	},
};

const modelsResponse = {
	data: [{ created: 0, id: "minimax-m3", object: "model", owned_by: "opencode" }],
	object: "list",
};

const anthropicResponse = {
	content: [{ text: "pong", type: "text" }],
	id: "msg_bench",
	model: "minimax-m3",
	stop_reason: "end_turn",
	type: "message",
	usage: { input_tokens: 8, output_tokens: 4 },
};

const openAiResponse = {
	choices: [
		{
			finish_reason: "stop",
			index: 0,
			message: { content: "pong", role: "assistant" },
		},
	],
	created: 0,
	id: "chatcmpl_bench",
	model: "minimax-m3",
	object: "chat.completion",
};

Deno.serve({ hostname: host, port }, async (request) => {
	const url = new URL(request.url);

	if (request.method === "GET" && url.pathname === "/api.json") {
		return Response.json(metadataResponse, { headers: jsonHeaders });
	}

	if (request.method === "GET" && url.pathname === "/v1/models") {
		return Response.json(modelsResponse, { headers: jsonHeaders });
	}

	if (request.method === "POST" && url.pathname === "/v1/messages") {
		await request.arrayBuffer();
		return Response.json(anthropicResponse, { headers: jsonHeaders });
	}

	if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
		await request.arrayBuffer();
		return Response.json(openAiResponse, { headers: jsonHeaders });
	}

	return Response.json({ error: "not found" }, { headers: jsonHeaders, status: 404 });
});
