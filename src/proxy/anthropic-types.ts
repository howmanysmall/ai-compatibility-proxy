export type AnthropicMessageRole = "user" | "assistant";

export type AnthropicStopReason =
	| "end_turn"
	| "stop_sequence"
	| "max_tokens"
	| "tool_use"
	| "pause_turn"
	| "refusal"
	| string;

export interface AnthropicTextBlock {
	type: "text";
	text: string;
}

export interface AnthropicMessage {
	role: AnthropicMessageRole;
	content: string | ReadonlyArray<AnthropicTextBlock>;
}

export interface AnthropicMessagesRequest {
	model: string;
	max_tokens: number;
	messages: ReadonlyArray<AnthropicMessage>;
	system?: string;
	temperature?: number;
	top_p?: number;
	stop_sequences?: ReadonlyArray<string>;
	stream?: boolean;
}

export interface AnthropicUsage {
	input_tokens?: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
	output_tokens?: number;
	[key: string]: unknown;
}

export interface AnthropicMessagesResponse {
	id?: string;
	type?: string;
	role?: "assistant";
	model?: string;
	content?: ReadonlyArray<Readonly<Record<string, unknown>>>;
	stop_reason?: AnthropicStopReason | null;
	stop_sequence?: string | null;
	usage?: AnthropicUsage;
}
