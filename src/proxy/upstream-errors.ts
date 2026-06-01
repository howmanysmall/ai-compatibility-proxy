// oxlint-disable max-classes-per-file -- Required paired TaggedError exports for upstream failures.
import { Data } from "effect";

export class UpstreamTimeoutError extends Data.TaggedError("UpstreamTimeoutError")<{
	readonly timeoutMs: number;
	readonly url: string;
}> {}

export class UpstreamHttpError extends Data.TaggedError("UpstreamHttpError")<{
	readonly body: string;
	readonly contentType: string | null;
	readonly status: number;
	readonly url: string;
}> {}
