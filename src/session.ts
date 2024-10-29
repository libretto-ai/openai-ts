import { RateLimiter } from "limiter";
import OpenAI from "openai";
import { type CompletionCreateParamsNonStreaming } from "openai/resources";
import { RunCreateParamsNonStreaming } from "openai/resources/beta/threads/runs/runs";
import { type ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat";
import pLimit from "p-limit";

function getUrl(apiName: string, environmentName: string): string {
  if (process.env[environmentName]) {
    return process.env[environmentName]!;
  }
  const prefix =
    process.env.LIBRETTO_API_PREFIX ?? "https://app.getlibretto.com/api";
  return `${prefix}/${apiName}`;
}

interface OpenAIChatParameters
  extends Omit<ChatCompletionCreateParamsNonStreaming, "messages"> {
  modelProvider: "openai";
  modelType: "chat";
}

interface OpenAICompletionParameters
  extends Omit<CompletionCreateParamsNonStreaming, "prompt"> {
  modelProvider: "openai";
  modelType: "completion";
}

interface OpenAIThreadRunParameters extends RunCreateParamsNonStreaming {
  modelProvider: "openai";
  modelType: "assistants";
}

export type ModelParameters =
  | OpenAIChatParameters
  | OpenAICompletionParameters
  | OpenAIThreadRunParameters;

/**
 *
 */
export interface EventMetadata {
  promptTemplateText?: string | null;
  promptTemplateTextId?: string;
  promptTemplateChat?: any[];
  promptTemplateName?: string;
  apiName?: string;
  apiKey?: string;
  chatId?: string;
  parentEventId?: string;
  modelParameters?: ModelParameters;
  feedbackKey?: string;
  context?: Record<string, any>;
  tools?: any[];
}

/**
 * NOTE: This should match the expected ResponseMetrics type that is on our
 * server side.
 */
export interface ResponseMetrics {
  usage: OpenAI.Completions.CompletionUsage | undefined;
  finish_reason:
    | OpenAI.Completions.CompletionChoice["finish_reason"]
    | OpenAI.ChatCompletion.Choice["finish_reason"]
    | undefined
    | null;
  logprobs:
    | OpenAI.Completions.CompletionChoice.Logprobs
    | OpenAI.Chat.Completions.ChatCompletion.Choice.Logprobs
    | undefined
    | null;
  refusal: string | null;
}

export interface PromptEvent {
  params: Record<string, any>;
  /** Included after response */
  response?: string | null;
  /** Response time in ms */
  responseTime?: number;
  /** Included only if there is an error from openai, or error in validation */
  responseErrors?: string[];

  responseMetrics?: ResponseMetrics;
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  prompt: {}; //hack
}

export type Event = EventMetadata & PromptEvent;

const logRateLimiters: Record<number, RateLimiter> = {
  429: new RateLimiter({
    tokensPerInterval: 1,
    interval: "second",
  }),
  499: new RateLimiter({
    tokensPerInterval: 1,
    interval: "second",
  }),
};

const SEND_EVENT_CONCURRENCY_LIMIT = 25;
const SEND_EVENT_MAX_PENDING = 1000;
const sendEventLimiter = pLimit(SEND_EVENT_CONCURRENCY_LIMIT);

export async function send_event(event: Event) {
  if (!event.apiKey) {
    return;
  }

  const url = getUrl("event", "LIBRETTO_REPORTING_URL");
  const body = JSON.stringify(event);
  let status = 0;

  try {
    if (sendEventLimiter.pendingCount >= SEND_EVENT_MAX_PENDING) {
      status = 429; // Simulate "Too Many Requests"
      throw new Error(`too many pending requests (${SEND_EVENT_MAX_PENDING})`);
    }

    const response = await sendEventLimiter(fetch, url, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
      },
    });
    status = response.status;
    const responseJson = await extractJsonBody(response);
    if (!response.ok) {
      throw new Error(`Failed to send event: ${JSON.stringify(responseJson)}`);
    }

    return responseJson;
  } catch (e) {
    const emitLog = () => {
      console.error("Failed to send event to libretto:", e);
    };

    // Always log if LIBRETTO_DEBUG is on
    if (process.env.LIBRETTO_DEBUG === "true") {
      emitLog();
      return;
    }

    // Never log for non-client errors
    if (status < 400 || status >= 500) {
      return;
    }

    // Log unless we're over our limit for this status code
    const limiter = logRateLimiters[status];
    if (!limiter || limiter.tryRemoveTokens(1)) {
      emitLog();
      return;
    }
  }
}

async function extractJsonBody(response: Response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_err) {
    throw new Error(
      `Unparseable response (${response.status} ${response.statusText}): ${body}`,
    );
  }
}

export interface Feedback {
  /** The feedback_key that was passed to the `event` API. */
  feedbackKey?: string;
  /* A rating from 0 to 1 on the quality of the prompt response */
  rating?: number;
  /**
   * A better response than what the prompt responded with. (e.g. a correction
   * from a user)
   */
  betterResponse?: string;

  /**
   * Indicates that an event is "deleted." Used when assistant thread messages
   * were deleted in OpenAI -- we keep the original message event but mark it
   * as deleted via feedback.
   */
  isDeleted?: boolean;

  apiKey?: string;
}

/** Send feedback to the  */
export async function sendFeedback(body: Feedback) {
  if (!body.feedbackKey) {
    console.warn("Could not send feedback to Libretto: missing feedback key");
    return;
  }

  body.apiKey = body.apiKey ?? process.env.LIBRETTO_API_KEY;
  if (!body.apiKey) {
    console.warn("Could not send feedback to Libretto: missing API key");
    return;
  }

  // the endpoint expects snake_case variables
  const snakeCaseBody = Object.fromEntries(
    Object.entries(body).map(([k, v]) => {
      if (k === "feedbackKey") return ["feedback_key", v];
      if (k === "betterResponse") return ["better_response", v];
      if (k === "isDeleted") return ["is_deleted", v];
      return [k, v];
    }),
  );

  const url = getUrl("feedback", "LIBRETTO_FEEDBACK_URL");
  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify(snakeCaseBody),
    headers: {
      "Content-Type": "application/json",
    },
  });
  const responseJson = await extractJsonBody(response);
  if (!response.ok) {
    throw new Error(`Failed to send feedback: ${JSON.stringify(responseJson)}`);
  }

  return responseJson;
}
