import OpenAI from "openai";
import { APIPromise } from "openai/core";
import { ChatCompletionMessageParam } from "openai/resources/chat";
import { Stream } from "openai/streaming";
import { DeepPartial } from "ts-essentials";
import { ResponseMetrics } from "./session";
import {
  formatTemplate,
  getTemplate,
  isObjectTemplate,
  ObjectTemplate,
} from "./template";

// This allows for the streaming tool calls to work with this type.
// The streaming tool calls are all optional, but the static completions are not.
export type ResolvedToolCall =
  DeepPartial<OpenAI.Chat.ChatCompletionMessageToolCall>;

interface ResolvedAPIResult {
  response: string | null | undefined;
  /** Calls to any tools */
  tool_calls?: ResolvedToolCall[];
  responseMetrics?: ResponseMetrics;
  // Allows for streaming to set a final "raw" response
  // Using any because this just gets serialized and sent to the server
  streamRawResponse?: any;
}

export type ResolvedReturnValue =
  | Stream<OpenAI.Chat.Completions.ChatCompletionChunk>
  | Stream<OpenAI.Completions.Completion>
  | OpenAI.Chat.Completions.ChatCompletion
  | OpenAI.Completions.Completion;

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
  returnValue: ResolvedReturnValue;
  finalResultPromise: Promise<ResolvedAPIResult>;
}> {
  // Handle stream
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

  // Get the static result
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

  // Completion style response
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
  // These don't change regardless of the branch we go into
  const responseMetrics: ResponseMetrics = {
    usage: result.usage,
    finish_reason: result.choices?.[0]?.finish_reason,
    logprobs: result.choices?.[0]?.logprobs,
  };

  let responseContent = result.choices[0].message.content ?? undefined;

  // Deprecated Function calls
  if (result.choices[0].message.function_call) {
    responseContent = JSON.stringify(result.choices[0].message.function_call);
  }

  const toolCalls = result.choices[0].message.tool_calls;

  // No content
  return {
    response: responseContent,
    tool_calls: toolCalls,
    responseMetrics,
  };
}

function getStaticCompletion(
  result: OpenAI.Completions.Completion | null,
): ResolvedAPIResult {
  if (!result) {
    return {
      response: null,
      tool_calls: [],
    };
  }

  // Handle the text completion
  if (result.choices[0].text) {
    return {
      response: result.choices[0].text,
      tool_calls: [],
      responseMetrics: {
        usage: result.usage,
        finish_reason: result.choices[0].finish_reason,
        logprobs: result.choices[0].logprobs,
      },
    };
  }

  // Catch all
  return {
    response: undefined,
    tool_calls: [],
  };
}
export function getResolvedMessages(
  messages:
    | ChatCompletionMessageParam[]
    | ObjectTemplate<ChatCompletionMessageParam[]>,
  params?: Record<string, any>,
) {
  if (isObjectTemplate(messages)) {
    if (!params) {
      throw new Error(`Template requires params, but none were provided`);
    }
    const resolvedMessages = formatTemplate(messages, params);
    return { messages: resolvedMessages, template: getTemplate(messages) };
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
  if (isObjectTemplate(s)) {
    if (!params) {
      throw new Error(`Template requires params, but none were provided`);
    }
    const resolvedPrompt = formatTemplate(s, params);
    return { prompt: resolvedPrompt, template: getTemplate(s) };
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

    // This stores the chunks at the index of the tool number
    const accumulatedToolChunks: Record<
      number,
      OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[]
    > = [];

    let firstChatChunk: OpenAI.Chat.Completions.ChatCompletionChunk | null =
      null;

    try {
      for await (const item of iterable) {
        if (this.isChat) {
          const chatItem = item as OpenAI.Chat.Completions.ChatCompletionChunk;
          if (!firstChatChunk) {
            firstChatChunk = chatItem;
          }

          if (!chatItem.libretto) {
            chatItem.libretto = {};
          }
          chatItem.libretto.feedbackKey = this.feedbackKey;

          // https://community.openai.com/t/usage-stats-now-available-when-using-streaming-with-the-chat-completions-api-or-completions-api/738156/3
          // This is a special case, and content is empty on the final usage block
          if (chatItem.usage) {
            this.responseUsage = chatItem.usage;
            continue;
          }

          // Accumulate message content
          if (chatItem.choices[0].delta.content) {
            accumulatedResult.push(chatItem.choices[0].delta.content);
          }

          // Accumulate the tool choices
          if (chatItem.choices[0].delta.tool_calls) {
            // Accumulate all of the chunks at the given index of the tool call
            chatItem.choices[0].delta.tool_calls.forEach((toolCall) => {
              const index = toolCall.index ?? 0;

              if (!accumulatedToolChunks[index]) {
                accumulatedToolChunks[index] = [];
              }
              accumulatedToolChunks[index].push(toolCall);
            });
          } else if (chatItem.choices[0].delta.function_call) {
            accumulatedResult.push(
              JSON.stringify(chatItem.choices[0].delta.function_call),
            );
          }

          // finish reason and usage can just be set when we see it
          if (chatItem.choices[0].finish_reason) {
            this.finishReason = chatItem.choices[0].finish_reason;
          }
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
      // Need to collect the tool call pieces
      const finalResponse = accumulatedResult.join("");
      const finalToolCalls = this.makeToolCalls(accumulatedToolChunks);

      /**
       * We try to sort of reconstruct what a final response would look like
       */
      const finalRawResponse = { ...firstChatChunk };
      if (finalResponse && finalRawResponse?.choices?.[0]?.delta?.content) {
        finalRawResponse.choices[0].delta.content = finalResponse;
      }

      if (finalToolCalls && finalRawResponse?.choices?.[0]?.delta?.tool_calls) {
        finalRawResponse.choices[0].delta.tool_calls = finalToolCalls;
      }

      if (this.responseUsage) {
        finalRawResponse.usage = this.responseUsage;
      }

      if (this.finishReason && finalRawResponse?.choices?.[0]?.finish_reason) {
        finalRawResponse.choices[0].finish_reason = this.finishReason;
      }

      // add an indicator it's from a libretto stream
      finalRawResponse.libretto = finalRawResponse.libretto ?? {};
      finalRawResponse.libretto.context = {
        ...finalRawResponse.libretto.context,
        isLibrettoStream: true,
      };

      this.resolveIterator({
        tool_calls: finalToolCalls,
        response: finalResponse,
        streamRawResponse: finalRawResponse,
        responseMetrics: {
          usage: this.responseUsage,
          finish_reason: this.finishReason,
          logprobs: this.logProbs,
        },
      });
    }
  }

  /**
   * Here are how the chunks might look if there are multipl tool calls as well.
   * 
   * // Chunk 1
{
  "choices": [
    {
      "delta": {
        "tool_calls": [
          {
            "id": "call_1",
            "type": "function",
            "function": {
              "name": "get_weather"
            }
          },
          {
            "id": "call_2",
            "type": "function",
            "function": {
              "name": "get_time"
            }
          }
        ]
      }
    }
  ]
}

and then the next ones might look like this:
// Chunk 2
{
  "choices": [
    {
      "delta": {
        "tool_calls": [
          {
            "function": {
              "arguments": "{ \"location\": \"New"
            }
          },
          {
            "function": {
              "arguments": "{ \"timezone\": \"ES"
            }
          }
        ]
      }
    }
  ]
}

// Chunk 3
{
  "choices": [
    {
      "delta": {
        "tool_calls": [
          {
            "function": {
              "arguments": " York\" }"
            }
          },
          {
            "function": {
              "arguments": "T\" }"
            }
          }
        ]
      }
    }
  ]
}
   */
  private makeToolCalls(
    accumulatedToolCalls?: Record<
      number,
      OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[]
    >,
  ):
    | OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[]
    | undefined {
    // Nothing to do
    if (
      !accumulatedToolCalls ||
      Object.keys(accumulatedToolCalls).length === 0
    ) {
      return;
    }

    const returnTools: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[] =
      [];

    Object.keys(accumulatedToolCalls)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((index) => {
        const toolCallChunks = accumulatedToolCalls[index];

        // First one has the id and full info, other ones after just have function args added
        const firstToolCall = toolCallChunks.shift();
        if (!firstToolCall) {
          return;
        }

        for (const toolCall of toolCallChunks) {
          if (toolCall.function && toolCall.function.arguments) {
            if (firstToolCall && firstToolCall.function) {
              firstToolCall.function.arguments += toolCall.function.arguments;
            }
          }
        }

        returnTools.push(firstToolCall);
      });

    return returnTools;
  }
}
