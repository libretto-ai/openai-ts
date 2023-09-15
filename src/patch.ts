import { OpenAI } from "openai";
import { APIPromise } from "openai/core";
import { ChatCompletionMessage } from "openai/resources/chat";
import { send_event } from "./client";
import { OpenAIExtraParams } from "./event";
import { ObjectTemplate } from "./template";

export function patch(params?: OpenAIExtraParams) {
  const {
    apiKey,
    chatId,
    parentEventId,
    promptTemplateName,
    templateChat,
    templateParams,
    templateText,
  } = params ?? {};
  const originalCreateChat = patchChatCreate({
    templateParams,
    apiKey,
    templateChat,
    promptTemplateName,
    chatId,
    parentEventId,
  });

  const originalCreateCompletion = patchCompletionCreate({
    templateParams,
    apiKey,
    templateText,
    promptTemplateName,
    chatId,
    parentEventId,
  });

  return () => {
    OpenAI.Chat.Completions.prototype.create = originalCreateChat;
    OpenAI.Completions.prototype.create = originalCreateCompletion;
  };
}
function patchChatCreate({
  templateParams,
  apiKey,
  templateChat,
  promptTemplateName,
  chatId,
  parentEventId,
}: {
  templateParams: Record<string, any> | undefined;
  apiKey: string | undefined;
  templateChat: any[] | undefined;
  promptTemplateName: string | undefined;
  chatId: string | undefined;
  parentEventId: string | undefined;
}) {
  const originalCreateChat = OpenAI.Chat.Completions.prototype.create;

  const newCreateChat = async function (
    this: typeof OpenAI.Chat.Completions.prototype,
    body,
    options
  ) {
    const now = Date.now();
    const {
      ip_api_key,
      ip_template_text,
      ip_chat_id,
      ip_parent_event_id,
      ip_prompt_template_name,
      ip_template_chat,
      ip_template_params,
      ip_only_named_prompts,
      messages,
      stream,
      ...openaiBody
    } = body;

    const { messages: resolvedMessages, template } = getResolvedMessages(
      messages,
      ip_template_params
    );

    const resultPromise = originalCreateChat.apply(this, [
      { ...openaiBody, messages: resolvedMessages, stream },
      options,
    ]);

    const resolvedPromptTemplateName =
      ip_prompt_template_name ?? promptTemplateName;

    if (ip_only_named_prompts && !resolvedPromptTemplateName) {
      return resultPromise;
    }
    if (stream) {
      // We don't deal with stream yet
      return resultPromise;
    }
    const result = await resultPromise;
    const responseTime = Date.now() - now;
    const streamResult = "controller" in result ? result : null;
    const staticResult = "choices" in result ? result : null;

    const staticContent = getStaticContent(staticResult);
    // note: not awaiting the result of this
    send_event({
      responseTime,
      response: staticContent,
      params: ip_template_params ?? templateParams ?? {},
      apiKey: ip_api_key ?? apiKey ?? process.env.PROMPT_API_KEY,
      promptTemplateChat:
        ip_template_chat ?? template ?? templateChat ?? resolvedMessages,
      promptTemplateName: resolvedPromptTemplateName,
      apiName: ip_prompt_template_name ?? promptTemplateName,
      prompt: {},
      chatId: ip_chat_id ?? chatId,
      parentEventId: ip_parent_event_id ?? parentEventId,
      modelParameters: {
        modelProvider: "openai",
        modelType: "chat",
        ...openaiBody,
      },
    });
    return resultPromise as APIPromise<any>;
  } as typeof originalCreateChat;

  OpenAI.Chat.Completions.prototype.create = newCreateChat;
  return originalCreateChat;
}

type PromptString = string | string[] | number[] | number[][] | null;

function patchCompletionCreate({
  templateParams,
  apiKey,
  templateText,
  promptTemplateName,
  chatId,
  parentEventId,
}: {
  templateParams: Record<string, any> | undefined;
  apiKey: string | undefined;
  templateText: string | undefined;
  promptTemplateName: string | undefined;
  chatId: string | undefined;
  parentEventId: string | undefined;
}) {
  const originalCreateCompletion = OpenAI.Completions.prototype.create;

  const newCreateCompletion = async function (
    this: typeof OpenAI.Completions.prototype,
    body,
    options
  ) {
    const now = Date.now();
    const {
      ip_api_key,
      ip_template_text,
      ip_chat_id,
      ip_parent_event_id,
      ip_prompt_template_name,
      ip_template_chat,
      ip_template_params,
      ip_only_named_prompts,
      prompt,
      stream,
      ...openaiBody
    } = body;

    const { prompt: resolvedPrompt, template } = getResolvedPrompt(
      prompt,
      ip_template_params
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

    if (ip_only_named_prompts && !resolvedPromptTemplateName) {
      return resultPromise;
    }
    if (stream) {
      // We don't deal with stream yet
      return resultPromise;
    }
    const result = await resultPromise;

    const responseTime = Date.now() - now;
    const streamResult = "controller" in result ? result : null;
    const staticResult = "choices" in result ? result : null;

    const staticContent = getStaticCompletion(staticResult);
    send_event({
      responseTime,
      response: staticContent,
      params: ip_template_params ?? templateParams ?? {},
      apiKey: ip_api_key ?? apiKey ?? process.env.PROMPT_API_KEY,
      promptTemplateText:
        ip_template_text ?? template ?? templateText ?? resolvedPromptStr,
      promptTemplateName: resolvedPromptTemplateName,
      apiName: ip_prompt_template_name ?? promptTemplateName,
      prompt: {},
      chatId: ip_chat_id ?? chatId,
      parentEventId: ip_parent_event_id ?? parentEventId,
      modelParameters: {
        modelProvider: "openai",
        modelType: "completion",
        ...openaiBody,
      },
    });
    return resultPromise as APIPromise<any>;
  } as typeof originalCreateCompletion;

  OpenAI.Completions.prototype.create = newCreateCompletion;
  return originalCreateCompletion;
}
function getStaticContent(
  result: OpenAI.Chat.Completions.ChatCompletion | null
) {
  if (!result) {
    return null;
  }
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
  params?: Record<string, any>
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
  params?: Record<string, any>
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
    return { prompt: s, template: null };
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
