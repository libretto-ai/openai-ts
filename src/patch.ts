import { OpenAI } from "openai";
import { APIPromise } from "openai/core";
import { OpenAIExtraParams } from ".";
import { send_event } from "./client";

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
  const originalCreateChat = makeCreateChat({
    templateParams,
    apiKey,
    templateChat,
    promptTemplateName,
    chatId,
    parentEventId,
  });

  return () => {
    OpenAI.Chat.Completions.prototype.create = originalCreateChat;
  };
}
function makeCreateChat({
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
      apiKey: ip_api_key ?? apiKey ?? process.env.PROMPT_API_KEY,
      promptTemplateChat: ip_template_chat ?? templateChat ?? messages,
      promptTemplateName: ip_prompt_template_name ?? promptTemplateName,
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
