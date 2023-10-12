import crypto from "crypto";
import OpenAI from "openai";
import { APIPromise } from "openai/core";
import { ChatCompletionMessage } from "openai/resources/chat";
import { Stream } from "openai/streaming";
import { send_event } from "./client";
import { OpenAIExtraParams } from "./event";
import { ObjectTemplate } from "./template";

export function patch(params?: OpenAIExtraParams) {
  const {
    apiKey,
    promptTemplateName,
    allowUnnamedPrompts,
    templateText,
    templateChat,
    templateParams,
    chatId,
    parentEventId,
    OpenAI: OpenAIObj = OpenAI,
  } = params ?? {};
  const originalCreateChat = patchChatCreate({
    templateParams,
    apiKey,
    templateChat,
    promptTemplateName,
    allowUnnamedPrompts,
    chatId,
    parentEventId,
    OpenAIObj,
  });

  const originalCreateCompletion = patchCompletionCreate({
    templateParams,
    apiKey,
    templateText,
    promptTemplateName,
    allowUnnamedPrompts,
    chatId,
    parentEventId,
    OpenAIObj,
  });

  return () => {
    OpenAIObj.Chat.Completions.prototype.create = originalCreateChat;
    OpenAIObj.Completions.prototype.create = originalCreateCompletion;
  };
}
function patchChatCreate({
  templateParams,
  apiKey,
  templateChat,
  promptTemplateName,
  allowUnnamedPrompts,
  chatId,
  parentEventId,
  OpenAIObj,
}: {
  templateParams: Record<string, any> | undefined;
  apiKey: string | undefined;
  templateChat: any[] | undefined;
  promptTemplateName: string | undefined;
  allowUnnamedPrompts: boolean | undefined;
  chatId: string | undefined;
  parentEventId: string | undefined;
  OpenAIObj: typeof OpenAI;
}) {
  const originalCreateChat = OpenAIObj.Chat.Completions.prototype.create;

  const newCreateChat = async function (
    this: typeof OpenAI.Chat.Completions.prototype,
    body,
    options,
  ) {
    const now = Date.now();
    const {
      ip_api_key,
      ip_chat_id,
      ip_parent_event_id,
      ip_prompt_template_name,
      ip_template_chat,
      ip_template_params,
      ip_feedback_key,
      messages,
      stream,
      ...openaiBody
    } = body;

    const { messages: resolvedMessages, template } = getResolvedMessages(
      messages,
      ip_template_params,
    );

    const resultPromise = originalCreateChat.apply(this, [
      { ...openaiBody, messages: resolvedMessages, stream },
      options,
    ]);

    const resolvedPromptTemplateName =
      ip_prompt_template_name ?? promptTemplateName;

    if (!resolvedPromptTemplateName && !allowUnnamedPrompts) {
      return resultPromise;
    }

    const feedbackKey = ip_feedback_key ?? crypto.randomUUID();
    const { finalResultPromise, returnValue } = await getResolvedStream(
      resultPromise,
      stream,
      feedbackKey,
      true,
    );

    // note: not awaiting the result of this
    finalResultPromise.then((response) => {
      const responseTime = Date.now() - now;
      send_event({
        responseTime,
        response,
        params: ip_template_params ?? templateParams ?? {},
        apiKey: ip_api_key ?? apiKey ?? process.env.PROMPT_API_KEY,
        promptTemplateChat:
          ip_template_chat ?? template ?? templateChat ?? resolvedMessages,
        promptTemplateName: resolvedPromptTemplateName,
        apiName: ip_prompt_template_name ?? promptTemplateName,
        prompt: {},
        chatId: ip_chat_id ?? chatId,
        parentEventId: ip_parent_event_id ?? parentEventId,
        feedbackKey,
        modelParameters: {
          modelProvider: "openai",
          modelType: "chat",
          ...openaiBody,
        },
      });
    });
    return returnValue;
  } as typeof originalCreateChat;

  OpenAIObj.Chat.Completions.prototype.create = newCreateChat;
  return originalCreateChat;
}

/** This function papers over the difference between streamed and unstreamed
 * responses. It splits the response into two parts:
 * 1. The return value, which is what the caller should return immediately (may
 *    be stream or raw result)
 * 2. A promise that resolves to the final (string) result. If the original
 *    response is streamed, this promise doesn't resolve until the stream is
 *    finished.
 */
async function getResolvedStream(
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
  finalResultPromise: Promise<string | null | undefined>;
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
  staticResult.ip_feedback_key = feedbackKey;

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

function patchCompletionCreate({
  templateParams,
  apiKey,
  templateText,
  promptTemplateName,
  allowUnnamedPrompts,
  chatId,
  parentEventId,
  OpenAIObj,
}: {
  templateParams: Record<string, any> | undefined;
  apiKey: string | undefined;
  templateText: string | undefined;
  promptTemplateName: string | undefined;
  allowUnnamedPrompts: boolean | undefined;
  chatId: string | undefined;
  parentEventId: string | undefined;
  OpenAIObj: typeof OpenAI;
}) {
  const originalCreateCompletion = OpenAIObj.Completions.prototype.create;

  const newCreateCompletion = async function (
    this: typeof OpenAI.Completions.prototype,
    body,
    options,
  ) {
    const now = Date.now();
    const {
      ip_api_key,
      ip_template_text,
      ip_chat_id,
      ip_parent_event_id,
      ip_prompt_template_name,
      ip_template_params,
      ip_feedback_key,
      prompt,
      stream,
      ...openaiBody
    } = body;

    const { prompt: resolvedPrompt, template } = getResolvedPrompt(
      prompt,
      ip_template_params,
    );

    const resultPromise = originalCreateCompletion.apply(this, [
      { ...openaiBody, prompt: resolvedPrompt, stream },
      options,
    ]);

    const resolvedPromptStr = Array.isArray(resolvedPrompt)
      ? null
      : resolvedPrompt;

    const resolvedPromptTemplateName =
      ip_prompt_template_name ?? promptTemplateName;

    if (!resolvedPromptTemplateName && !allowUnnamedPrompts) {
      return resultPromise;
    }

    const feedbackKey = ip_feedback_key ?? crypto.randomUUID();

    const { finalResultPromise, returnValue } = await getResolvedStream(
      resultPromise,
      stream,
      feedbackKey,
      false,
    );
    finalResultPromise.then((response) => {
      const responseTime = Date.now() - now;
      send_event({
        responseTime,
        response,
        params: ip_template_params ?? templateParams ?? {},
        apiKey: ip_api_key ?? apiKey ?? process.env.PROMPT_API_KEY,
        promptTemplateText:
          ip_template_text ?? template ?? templateText ?? resolvedPromptStr,
        promptTemplateName: resolvedPromptTemplateName,
        apiName: ip_prompt_template_name ?? promptTemplateName,
        prompt: {},
        chatId: ip_chat_id ?? chatId,
        parentEventId: ip_parent_event_id ?? parentEventId,
        feedbackKey,
        modelParameters: {
          modelProvider: "openai",
          modelType: "completion",
          ...openaiBody,
        },
      });
    });
    return returnValue;
  } as typeof originalCreateCompletion;

  OpenAIObj.Completions.prototype.create = newCreateCompletion;
  return originalCreateCompletion;
}

function getStaticChatCompletion(
  result: OpenAI.Chat.Completions.ChatCompletion,
) {
  if (result.choices[0].message.content) {
    return result.choices[0].message.content;
  }
  if (result.choices[0].message.function_call) {
    return JSON.stringify(result.choices[0].message.function_call);
  }
}

function getStaticCompletion(result: OpenAI.Completions.Completion | null) {
  if (!result) {
    return null;
  }
  if (result.choices[0].text) {
    return result.choices[0].text;
  }
}
function getResolvedMessages(
  messages: ChatCompletionMessage[] | ObjectTemplate<ChatCompletionMessage[]>,
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

function getResolvedPrompt(
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
  finishPromise: Promise<string>;
  private resolveIterator!: (v: string) => void;
  private accumulatedResult: string[] = [];
  isChat: boolean;
  feedbackKey: string;

  constructor(
    innerStream: Stream<T>,
    isChat: boolean | undefined,
    feedbacKey: string,
  ) {
    super((innerStream as any).response, (innerStream as any).controller);
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
          const chatItem = item as OpenAI.Chat.Completions.ChatCompletionChunk;
          chatItem.ip_feedback_key = this.feedbackKey;
          if (chatItem.choices[0].delta.content) {
            this.accumulatedResult.push(chatItem.choices[0].delta.content);
          } else if (chatItem.choices[0].delta.function_call) {
            this.accumulatedResult.push(
              JSON.stringify(chatItem.choices[0].delta.function_call),
            );
          }
        } else {
          const completionItem = item as OpenAI.Completions.Completion;
          completionItem.ip_feedback_key = this.feedbackKey;
          this.accumulatedResult.push(completionItem.choices[0].text);
        }
        yield item;
      }
    } finally {
      this.resolveIterator(this.accumulatedResult.join(""));
    }
  }
}
