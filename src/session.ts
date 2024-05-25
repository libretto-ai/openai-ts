import Anthropic from "@anthropic-ai/sdk";

function getUrl(apiName: string, environmentName: string): string {
  if (process.env[environmentName]) {
    return process.env[environmentName]!;
  }
  const prefix =
    process.env.LIBRETTO_API_PREFIX ?? "https://app.getlibretto.com/api";
  return `${prefix}/${apiName}`;
}

interface AnthropicMessagesParameters
  extends Omit<Anthropic.Messages.MessageCreateParamsNonStreaming, "messages"> {
  modelProvider: "anthropic";
  modelType: "chat";
}
interface AnthropicCompletionParameters
  extends Omit<
    Anthropic.Completions.CompletionCreateParamsNonStreaming,
    "prompt"
  > {
  modelProvider: "anthropic";
  modelType: "completion";
}
export type ModelParameters =
  | AnthropicMessagesParameters
  | AnthropicCompletionParameters;

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
export interface PromptEvent {
  params: Record<string, any>;
  /** Included after response */
  response?: string | null;
  /** Response time in ms */
  responseTime?: number;
  /** Included only if there is an error from Anthropic, or error in validation */
  responseErrors?: string[];

  responseMetrics?: {
    usage: Anthropic.Messages.Usage | undefined;
    stop_reason:
      | Anthropic.Messages.Message["stop_reason"]
      | Anthropic.Completions.Completion["stop_reason"]
      | undefined
      | null;
  };
  // eslint-disable-next-line @typescript-eslint/ban-types
  prompt: {}; //hack
}

export type Event = EventMetadata & PromptEvent;

export async function send_event(event: Event) {
  if (!event.apiKey) {
    return;
  }

  const url = getUrl("event", "LIBRETTO_REPORTING_URL");
  const body = JSON.stringify(event);
  const response = await fetch(url, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
    },
  });
  const responseJson = await extractJsonBody(response);
  if (!response.ok) {
    throw new Error(`Failed to send event: ${JSON.stringify(responseJson)}`);
  }

  return responseJson;
}
async function extractJsonBody(response: Response) {
  try {
    const responseJson = await response.json();
    return responseJson;
  } catch (e) {
    throw new Error(
      `Unparseable response: ${response.status} ${response.statusText} ${e}`,
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
