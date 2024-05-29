import OpenAI from "openai";
import { APIPromise } from "openai/core";
import { ChatCompletionMessageParam } from "openai/resources/chat";
import { Stream } from "openai/streaming";
import { ObjectTemplate } from "./template";

export interface ToolCallAsJsonFragment {
  id: string | undefined;
  name: string;
  /** A JSON representation of the arguments dictionary, e.g. `"{ \"arg1\": \"val1\" }"` */
  argsAsJson: string;
}

interface ResolvedAPIResult {
  response: string | null | undefined;
  /** Calls to any tools */
  tool_calls: ToolCallAsJsonFragment[];
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
}

/** This function papers over the difference between streamed and unstreamed
 * responses. It splits the response into two parts:
 * 1. The return value, which is what the caller should return immediately (may
 *    be stream or raw result)
 * 2. A promise that resolves to the final (string) result. If the original
 *    response is streamed, this promise doesn't resolve until the stream is
 *    finished.
 */
export async function getResolvedStream(
  resultPromise: APIPromise<
    | Stream<OpenAI.Chat.Completions.ChatCompletionChunk>
    | Stream<OpenAI.Completions.Completion>
    | OpenAI.Chat.Completions.ChatCompletion
    | OpenAI.Completions.Completion
  >,
  stream: boolean | null | undefined,
  feedbackKey: string,
  isChat: boolean,
): Promise<{
  returnValue:
    | Stream<OpenAI.Chat.Completions.ChatCompletionChunk>
    | Stream<OpenAI.Completions.Completion>
    | OpenAI.Chat.Completions.ChatCompletion
    | OpenAI.Completions.Completion;
  finalResultPromise: Promise<ResolvedAPIResult>;
}> {
  if (stream) {
    const chunkStream = (await resultPromise) as
      | Stream<OpenAI.Chat.Completions.ChatCompletionChunk>
      | Stream<OpenAI.Completions.Completion>;
    const wrappedStream = new WrappedStream(
      chunkStream as Stream<any>,
      isChat,
      feedbackKey,
    );
    return {
      returnValue: wrappedStream,
      finalResultPromise: wrappedStream.finishPromise,
    };
    // TODO: deal with streamed completions
  }
  const staticResult = (await resultPromise) as
    | OpenAI.Chat.Completions.ChatCompletion
    | OpenAI.Completions.Completion;
  if (!staticResult.libretto) {
    staticResult.libretto = {};
  }
  staticResult.libretto.feedbackKey = feedbackKey;

  if (isChat) {
    return {
      returnValue: await resultPromise,
      finalResultPromise: Promise.resolve(
        getStaticChatCompletion(
          staticResult as OpenAI.Chat.Completions.ChatCompletion,
        ),
      ),
    };
  }
  return {
    returnValue: await resultPromise,
    finalResultPromise: Promise.resolve(
      getStaticCompletion(staticResult as OpenAI.Completions.Completion),
    ),
  };
}

type PromptString = string | string[] | number[] | number[][] | null;

function getStaticChatCompletion(
  result: OpenAI.Chat.Completions.ChatCompletion,
): ResolvedAPIResult {
  if (result.choices[0].message.content) {
    return {
      response: result.choices[0].message.content,
      tool_calls: [],
      usage: result.usage,
      finish_reason: result.choices[0].finish_reason,
      logprobs: result.choices[0].logprobs,
    };
  }
  if (result.choices[0].message.function_call) {
    return {
      response: JSON.stringify({
        function_call: result.choices[0].message.function_call,
      }),
      tool_calls: [],
      usage: result.usage,
      finish_reason: result.choices[0].finish_reason,
      logprobs: result.choices[0].logprobs,
    };
  }
  if (result.choices[0].message.tool_calls) {
    return {
      response: JSON.stringify({
        tool_calls: result.choices[0].message.tool_calls,
      }),
      // Note that we have already converted this fromJSON, so we do not want to put
      tool_calls: [],
      usage: result.usage,
      finish_reason: result.choices[0].finish_reason,
      logprobs: result.choices[0].logprobs,
    };
  }
  return {
    response: undefined,
    tool_calls: [],
    usage: result.usage,
    finish_reason: result.choices[0].finish_reason,
    logprobs: result.choices[0].logprobs,
  };
}

function getStaticCompletion(
  result: OpenAI.Completions.Completion | null,
): ResolvedAPIResult {
  if (!result) {
    return {
      response: null,
      tool_calls: [],
      usage: undefined,
      finish_reason: undefined,
      logprobs: undefined,
    };
  }
  if (result.choices[0].text) {
    return {
      response: result.choices[0].text,
      tool_calls: [],
      usage: result.usage,
      finish_reason: result.choices[0].finish_reason,
      logprobs: result.choices[0].logprobs,
    };
  }
  return {
    response: undefined,
    tool_calls: [],
    usage: result.usage,
    finish_reason: undefined,
    logprobs: result.choices[0].logprobs,
  };
}
export function getResolvedMessages(
  messages:
    | ChatCompletionMessageParam[]
    | ObjectTemplate<ChatCompletionMessageParam[]>,
  params?: Record<string, any>,
) {
  if ("template" in messages && "format" in messages) {
    if (!params) {
      throw new Error(`Template requires params, but none were provided`);
    }
    const resolvedMessages = messages.format(params);
    return { messages: resolvedMessages, template: messages.template };
  }
  return { messages, template: null };
}

export function getResolvedPrompt(
  s: PromptString | ObjectTemplate<string>,
  params?: Record<string, any>,
) {
  if (typeof s === "string") {
    return { prompt: s, template: null };
  }
  if (!s || Array.isArray(s)) {
    if (!s) {
      return { prompt: s, template: null };
    }
    if (typeof s[0] === "number") {
      console.warn(`Cannot use token numbers in prompt arrays`);
    }
    const str = s.join("");
    return { prompt: str, template: null };
  }
  if (!s) {
    return { prompt: s, template: null };
  }
  if ("template" in s && "format" in s) {
    if (!params) {
      throw new Error(`Template requires params, but none were provided`);
    }
    const resolvedPrompt = s.format(params);
    return { prompt: resolvedPrompt, template: s.template };
  }
  return { prompt: s, template: null };
}

class WrappedStream<
  T extends
    | OpenAI.Chat.Completions.ChatCompletionChunk
    | OpenAI.Completions.Completion,
> extends Stream<T> {
  finishPromise: Promise<ResolvedAPIResult>;
  private resolveIterator!: (v: ResolvedAPIResult) => void;
  private responseUsage: OpenAI.Completions.CompletionUsage | undefined;
  private finishReason:
    | OpenAI.Completions.CompletionChoice["finish_reason"]
    | OpenAI.ChatCompletion.Choice["finish_reason"]
    | undefined
    | null;
  private logProbs:
    | OpenAI.Completions.CompletionChoice.Logprobs
    | OpenAI.Chat.Completions.ChatCompletion.Choice.Logprobs
    | undefined
    | null;
  isChat: boolean;
  feedbackKey: string;

  constructor(
    innerStream: Stream<T>,
    isChat: boolean | undefined,
    feedbacKey: string,
  ) {
    super((innerStream as any).iterator, innerStream.controller);
    this.isChat = !!isChat;
    this.finishPromise = new Promise((r) => (this.resolveIterator = r));
    this.feedbackKey = feedbacKey;
  }

  async *[Symbol.asyncIterator]() {
    // Turn iterator into an iterable
    const iter = super[Symbol.asyncIterator]();
    const iterable = {
      [Symbol.asyncIterator]: () => iter,
    };
    const accumulatedResult: string[] = [];
    const accumulatedTools: {
      id: string | undefined;
      name: string;
      args: string[];
    }[] = [];
    try {
      for await (const item of iterable) {
        if (this.isChat) {
          const chatItem = item as OpenAI.Chat.Completions.ChatCompletionChunk;
          if (!chatItem.libretto) {
            chatItem.libretto = {};
          }
          chatItem.libretto.feedbackKey = this.feedbackKey;
          if (chatItem.choices[0].delta.content) {
            accumulatedResult.push(chatItem.choices[0].delta.content);
          } else if (chatItem.choices[0].delta.tool_calls) {
            // Not sure what happens if tool_calls has > 1 item in a streaming context?
            const firstToolCall = chatItem.choices[0].delta.tool_calls[0];
            // We are assuming if there is more than one, then the index will
            // match up, i.e. the 2nd tool call in this response will have
            // index == 1
            if (
              firstToolCall.index >= accumulatedTools.length &&
              firstToolCall.function?.name
            ) {
              accumulatedTools.push({
                id: firstToolCall.id,
                name: firstToolCall.function.name,
                args: [firstToolCall.function.arguments ?? ""],
              });
            }
            accumulatedTools[firstToolCall.index].args.push(
              firstToolCall.function?.arguments ?? "",
            );
          } else if (chatItem.choices[0].delta.function_call) {
            accumulatedResult.push(
              JSON.stringify(chatItem.choices[0].delta.function_call),
            );
          }
          this.finishReason = chatItem.choices[0].finish_reason;
          // TODO: get usage from streaming chat. This is currently missing from the API!
          // https://community.openai.com/t/openai-api-get-usage-tokens-in-response-when-set-stream-true/141866
          // https://community.openai.com/t/chat-completion-stream-api-token-usage/352964
        } else {
          const completionItem = item as OpenAI.Completions.Completion;
          if (!completionItem.libretto) {
            completionItem.libretto = {};
          }
          completionItem.libretto.feedbackKey = this.feedbackKey;
          accumulatedResult.push(completionItem.choices[0].text);
          this.responseUsage = completionItem.usage;
          this.finishReason = completionItem.choices[0].finish_reason;
          this.logProbs = completionItem.choices[0].logprobs;
        }
        yield item;
      }
    } finally {
      this.resolveIterator({
        tool_calls: accumulatedTools.map(
          ({ id, name, args }): ToolCallAsJsonFragment => ({
            id,
            name,
            argsAsJson: args.join(""),
          }),
        ),
        response: accumulatedResult.join(""),
        usage: this.responseUsage,
        finish_reason: this.finishReason,
        logprobs: this.logProbs,
      });
    }
  }
}
/** Reformat json fragments into a JSON string representing `ChatCompletionMessageToolCall[]` */
export function reJsonToolCalls(tool_calls: ToolCallAsJsonFragment[]) {
  const tool_call_list = tool_calls
    .map(
      (tool_call) => `{
      ${tool_call.id ? `"id": "${tool_call.id}"` : ""},
      "type": "function",
      "function": {
        "name": "${tool_call.name}",
        "arguments": ${tool_call.argsAsJson}
      }
    }`,
    )
    .join(",\n");
  return `{"tool_calls": [${tool_call_list}]}`;
}
