import { OpenAI } from "openai";
import { APIPromise } from "openai/core";
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions";
import { send_event } from "./client";
export function hello() {
  return "Hello World!";
}

declare module "openai/resources/chat/completions" {
  interface ChatCompletionCreateParamsBase {
    ip_api_key?: string;
    ip_prompt_template_name?: string;
    ip_template_text?: string;
    ip_template_chat?: any[];
    ip_template_params?: Record<string, any>;
    ip_chat_id?: string;
    ip_parent_event_id?: string;
  }
}

interface OpenAIExtraParams {
  apiKey?: string;
  promptTemplateName?: string;
  eventId?: string;
  templateText?: string;
  templateChat?: any[];
  templateParams?: Record<string, any>;
  chatId?: string;
  parentEventId?: string;
}
export function patch({
  apiKey,
  chatId,
  eventId,
  parentEventId,
  promptTemplateName,
  templateChat,
  templateParams,
  templateText,
}: OpenAIExtraParams) {
  debugger;
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
      messages,
      stream,
      ...openaiBody
    } = body;
    const resultPromise = originalCreateChat.apply(this, [
      { ...openaiBody, messages, stream },
      options,
    ]);
    if (stream) {
      // We don't deal with stream yet
      return resultPromise;
    }
    const result = await resultPromise;
    const responseTime = Date.now() - now;
    const streamResult = "controller" in result ? result : null;
    const staticResult = "choices" in result ? result : null;

    const staticContent = getStaticContent(staticResult);
    send_event({
      responseTime,
      response: staticContent,
      params: ip_template_params ?? templateParams ?? {},
      apiKey: ip_api_key ?? apiKey,
      promptTemplateText: ip_template_text ?? templateText,
      promptTemplateChat: ip_template_chat ?? templateChat,
      apiName: promptTemplateName,
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

  return () => {
    OpenAI.Chat.Completions.prototype.create = originalCreateChat;
  };
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
