import _Anthropic from "@anthropic-ai/sdk";
import Core, { APIPromise } from "@anthropic-ai/sdk/core";
import API, {
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
} from "@anthropic-ai/sdk/resources";
import {
  Message,
  MessageCreateParams,
  MessageCreateParamsBase,
  MessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages";
import { Stream } from "@anthropic-ai/sdk/streaming";
import crypto from "crypto";
import { LibrettoConfig, send_event } from ".";
import { PiiRedactor } from "./pii";
import { getResolvedMessages, getResolvedStream } from "./resolvers";

export class LibrettoMessages extends API.Messages {
  protected piiRedactor?: PiiRedactor;

  constructor(
    client: _Anthropic,
    protected config: LibrettoConfig,
  ) {
    super(client);

    if (config.redactPii) {
      this.piiRedactor = new PiiRedactor();
    }
  }

  override create(
    body: MessageCreateParamsNonStreaming,
    options?: Core.RequestOptions,
  ): APIPromise<Message>;
  override create(
    body: MessageCreateParamsStreaming,
    options?: Core.RequestOptions,
  ): APIPromise<Stream<MessageStreamEvent>>;
  override create(
    body: MessageCreateParamsBase,
    options?: Core.RequestOptions,
  ): APIPromise<Stream<MessageStreamEvent> | Message>;
  override create(
    body: MessageCreateParams,
    options?: Core.RequestOptions,
  ): APIPromise<Message> | APIPromise<Stream<MessageStreamEvent>> {
    return this._create(body, options) as
      | APIPromise<Stream<MessageStreamEvent>>
      | APIPromise<Message>;
  }

  private async _create(
    body: MessageCreateParams,
    options?: Core.RequestOptions,
  ): Promise<Message | Stream<MessageStreamEvent>> {
    const now = Date.now();
    const { libretto, messages, stream, ...anthropicBody } = body;

    const { messages: resolvedMessages, template } = getResolvedMessages(
      messages,
      libretto?.templateParams,
    );

    const resultPromise = super.create(
      { ...anthropicBody, messages: resolvedMessages, stream },
      options,
    );

    const resolvedPromptTemplateName =
      libretto?.promptTemplateName ?? this.config.promptTemplateName;

    if (!resolvedPromptTemplateName && !this.config.allowUnnamedPrompts) {
      return resultPromise;
    }

    const feedbackKey = libretto?.feedbackKey ?? crypto.randomUUID();
    const { finalResultPromise, returnValue } = await getResolvedStream(
      resultPromise,
      stream,
      feedbackKey,
      false,
    );

    // note: not awaiting the result of this
    finalResultPromise.then(async ({ response, stop_reason, usage }) => {
      const responseTime = Date.now() - now;
      let params = libretto?.templateParams ?? {};

      // Redact PII before recording the event
      if (this.piiRedactor) {
        try {
          response = this.piiRedactor.redact(response);
          params = this.piiRedactor.redact(params);
        } catch (err) {
          console.log("Failed to redact PII", err);
        }
      }

      await send_event({
        responseTime,
        response,
        responseMetrics: {
          usage,
          stop_reason: stop_reason as Message["stop_reason"] | undefined | null,
        },
        params: params,
        apiKey:
          libretto?.apiKey ??
          this.config.apiKey ??
          process.env.LIBRETTO_API_KEY,
        promptTemplateChat:
          libretto?.templateChat ?? template ?? resolvedMessages,
        promptTemplateName: resolvedPromptTemplateName,
        apiName: libretto?.promptTemplateName ?? this.config.promptTemplateName,
        prompt: {},
        chatId: libretto?.chatId ?? this.config.chatId,
        parentEventId: libretto?.parentEventId,
        context: libretto?.context,
        feedbackKey,
        modelParameters: {
          modelProvider: "anthropic",
          modelType: "chat",
          ...anthropicBody,
        },
      });
    });

    return returnValue as
      | _Anthropic.Messages.Message
      | Stream<_Anthropic.Messages.MessageStreamEvent>;
  }
}
