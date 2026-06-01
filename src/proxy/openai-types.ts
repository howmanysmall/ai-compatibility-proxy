export type OpenAIChatRole = "system" | "developer" | "user" | "assistant" | "tool" | "function";

export type OpenAIFinishReason = "stop" | "length" | "tool_calls" | "content_filter";

export interface OpenAITextContentPart {
	type: "text";
	text: string;
}

export interface OpenAIChatMessage {
	role: OpenAIChatRole;
	content?: string | ReadonlyArray<OpenAITextContentPart | Readonly<Record<string, unknown>>> | null;
	name?: string;
	tool_call_id?: string;
	tool_calls?: unknown;
	function_call?: unknown;
}

export interface OpenAIChatCompletionRequest {
	model?: string;
	messages?: ReadonlyArray<OpenAIChatMessage>;
	max_tokens?: number;
	max_completion_tokens?: number;
	temperature?: number;
	top_p?: number;
	stop?: string | Array<string> | null;
	stream?: boolean;
	[key: string]: unknown;
}

export interface OpenAIErrorBody {
	error: {
		message: string;
		type: string;
		param: string | null;
		code: string | null;
	};
}

export interface OpenAIChatCompletionChoice {
	index: number;
	message: {
		role: "assistant";
		content: string;
	};
	finish_reason: OpenAIFinishReason | null;
}

export interface OpenAIUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

export interface OpenAIChatCompletionResponse {
	id: string;
	object: "chat.completion";
	created: number;
	model: string;
	choices: Array<OpenAIChatCompletionChoice>;
	usage?: OpenAIUsage;
}

export interface OpenAIChatCompletionChunk {
	id: string;
	object: "chat.completion.chunk";
	created: number;
	model: string;
	choices: Array<{
		index: number;
		delta: {
			role?: "assistant";
			content?: string;
		};
		finish_reason: OpenAIFinishReason | null;
	}>;
	usage?: OpenAIUsage;
}

export interface OpenAIModel {
	id: string;
	object: "model";
	created: number;
	owned_by: string;
}

export interface OpenAIModelListResponse {
	object: "list";
	data: ReadonlyArray<OpenAIModel>;
}
