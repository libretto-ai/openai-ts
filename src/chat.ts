import crypto from "crypto";
import Core, { OpenAI } from "openai";
import { APIPromise } from "openai/core";
import { Chat } from "openai/resources/chat/chat";
import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsBase,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  Completions,
} from "openai/resources/chat/completions";
import { Stream } from "openai/streaming";
import { LibrettoConfig, send_event } from ".";
import { getResolvedMessages, getResolvedStream } from "./resolvers";
import { PiiRedactor } from "./pii";

export class LibrettoChat extends Chat {
  constructor(
    client: OpenAI,
    protected config: LibrettoConfig,
  ) {
    super(client);
    this.completions = new LibrettoChatCompletions(client, config);
  }
}

class LibrettoChatCompletions extends Completions {
  protected piiRedactor?: PiiRedactor;

  constructor(
    client: OpenAI,
    protected config: LibrettoConfig,
  ) {
    super(client);

    if (config.redactPii) {
      this.piiRedactor = new PiiRedactor();
    }
  }

  override create(
    body: ChatCompletionCreateParamsNonStreaming,
    options?: Core.RequestOptions,
  ): APIPromise<ChatCompletion>;
  override create(
    body: ChatCompletionCreateParamsStreaming,
    options?: Core.RequestOptions,
  ): APIPromise<Stream<ChatCompletionChunk>>;
  override create(
    body: ChatCompletionCreateParamsBase,
    options?: Core.RequestOptions,
  ): APIPromise<Stream<ChatCompletionChunk> | ChatCompletion>;
  override create(
    body: ChatCompletionCreateParams,
    options?: Core.RequestOptions,
  ): APIPromise<ChatCompletion> | APIPromise<Stream<ChatCompletionChunk>> {
    return this._create(body, options) as
      | APIPromise<ChatCompletion>
      | APIPromise<Stream<ChatCompletionChunk>>;
  }

  private async _create(
    body: ChatCompletionCreateParams,
    options?: Core.RequestOptions,
  ): Promise<ChatCompletion | Stream<ChatCompletionChunk>> {
    const now = Date.now();
    const { libretto, messages, stream, ...openaiBody } = body;

    const { messages: resolvedMessages, template } = getResolvedMessages(
      messages,
      libretto?.templateParams,
    );

    const resultPromise = super.create(
      { ...openaiBody, messages: resolvedMessages, stream },
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
      true,
    );

    // note: not awaiting the result of this
    finalResultPromise.then(async (response) => {
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
        feedbackKey,
        modelParameters: {
          modelProvider: "openai",
          modelType: "chat",
          ...openaiBody,
        },
      });
    });
    return returnValue as ChatCompletion | Stream<ChatCompletionChunk>;
  }
}
