import Anthropic from "@anthropic-ai/sdk";
import { APIPromise } from "@anthropic-ai/sdk/core";
import { Stream } from "@anthropic-ai/sdk/streaming";
import { ObjectTemplate } from "./template";

interface ResolvedAPIResult {
  response: string | null | undefined;
  usage?: Anthropic.Messages.Usage | undefined;
  stop_reason?:
    | Anthropic.Completions.Completion["stop_reason"]
    | Anthropic.Messages.Message["stop_reason"]
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
    | Stream<Anthropic.Messages.MessageStreamEvent>
    | Stream<Anthropic.Completions.Completion>
    | Anthropic.Messages.Message
    | Anthropic.Completions.Completion
  >,
  stream: boolean | null | undefined,
  feedbackKey: string,
  isChat: boolean,
): Promise<{
  returnValue:
    | Stream<Anthropic.Messages.MessageStreamEvent>
    | Stream<Anthropic.Completions.Completion>
    | Anthropic.Messages.Message
    | Anthropic.Completions.Completion;
  finalResultPromise: Promise<ResolvedAPIResult>;
}> {
  if (stream) {
    const chunkStream = (await resultPromise) as
      | Stream<Anthropic.Messages.MessageStreamEvent>
      | Stream<Anthropic.Completions.Completion>;
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
    | Anthropic.Messages.Message
    | Anthropic.Completions.Completion;
  if (!staticResult.libretto) {
    staticResult.libretto = {};
  }
  staticResult.libretto.feedbackKey = feedbackKey;

  if (isChat) {
    return {
      returnValue: await resultPromise,
      finalResultPromise: Promise.resolve(
        getStaticChatCompletion(staticResult as Anthropic.Messages.Message),
      ),
    };
  }
  return {
    returnValue: await resultPromise,
    finalResultPromise: Promise.resolve(
      getStaticCompletion(staticResult as Anthropic.Completions.Completion),
    ),
  };
}

type PromptString = string | string[] | number[] | number[][];

function getStaticChatCompletion(
  result: Anthropic.Messages.Message,
): ResolvedAPIResult {
  if (result.content && result.content[0].type === "text") {
    return {
      response: result.content[0].text,
      usage: result.usage,
      stop_reason: result.stop_reason,
    };
  }
  // if (result.choices[0].message.function_call) {
  //   return {
  //     response: JSON.stringify({
  //       function_call: result.choices[0].message.function_call,
  //     }),
  //     usage: result.usage,
  //     finish_reason: result.choices[0].finish_reason,
  //     logprobs: result.choices[0].logprobs,
  //   };
  // }
  // if (result.choices[0].message.tool_calls) {
  //   return {
  //     response: JSON.stringify({
  //       tool_calls: result.choices[0].message.tool_calls,
  //     }),
  //     usage: result.usage,
  //     finish_reason: result.choices[0].finish_reason,
  //     logprobs: result.choices[0].logprobs,
  //   };
  // }
  return {
    response: undefined,
    usage: result.usage,
    stop_reason: result.stop_reason,
  };
}

function getStaticCompletion(
  result: Anthropic.Completion | null,
): ResolvedAPIResult {
  if (!result) {
    return {
      response: null,
      usage: undefined,
      stop_reason: undefined,
      // logprobs: undefined,
    };
  }
  if (result.completion) {
    return {
      response: result.completion,
      stop_reason: result.stop_reason,
      // usage: result.usage,
      // finish_reason: result.choices[0].finish_reason,
      // logprobs: result.choices[0].logprobs,
    };
  }
  return {
    response: undefined,
    stop_reason: undefined,
    // usage: result.usage,
    // finish_reason: undefined,
    // logprobs: result.choices[0].logprobs,
  };
}
export function getResolvedMessages(
  messages:
    | Anthropic.Messages.MessageParam[]
    | ObjectTemplate<Anthropic.Messages.MessageParam[]>,
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
    | Anthropic.Completions.Completion
    | Anthropic.Messages.MessageStreamEvent,
> extends Stream<T> {
  finishPromise: Promise<ResolvedAPIResult>;
  private resolveIterator!: (v: ResolvedAPIResult) => void;
  private accumulatedResult: string[] = [];
  private responseUsage: Anthropic.Messages.Usage | undefined;
  private finishReason:
    | Anthropic.Messages.Message["stop_reason"]
    | Anthropic.Messages.RawMessageDeltaEvent.Delta["stop_reason"]
    | Anthropic.Completions.Completion["stop_reason"]
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
    try {
      for await (const item of iterable) {
        if (this.isChat) {
          const chatItem = item as Anthropic.Messages.MessageStreamEvent;
          if (!chatItem.libretto) {
            chatItem.libretto = {};
          }
          chatItem.libretto.feedbackKey = this.feedbackKey;
          if (chatItem.type === "content_block_delta") {
            this.accumulatedResult.push(
              chatItem.delta.type === "text_delta"
                ? chatItem.delta.text
                : chatItem.delta.partial_json,
            );
            // } else if (chatItem.choices[0].delta.function_call) {
            //   this.accumulatedResult.push(
            //     JSON.stringify(chatItem.choices[0].delta.function_call),
            //   );
          }
          if (chatItem.type === "message_delta" && chatItem.delta.stop_reason) {
            this.finishReason = chatItem.delta.stop_reason;
          }
          // TODO: get usage from streaming chat.
        } else {
          const completionItem = item as Anthropic.Completions.Completion;
          if (!completionItem.libretto) {
            completionItem.libretto = {};
          }
          completionItem.libretto.feedbackKey = this.feedbackKey;
          this.accumulatedResult.push(completionItem.completion);
          this.finishReason = completionItem.stop_reason;
        }
        yield item;
      }
    } finally {
      this.resolveIterator({
        response: this.accumulatedResult.join(""),
        usage: this.responseUsage,
        stop_reason: this.finishReason,
      });
    }
  }
}
