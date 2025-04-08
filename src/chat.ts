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
import { LibrettoConfig, LibrettoCreateParams, send_event } from ".";
import { PiiRedactor } from "./pii";
import {
  getResolvedMessages,
  getResolvedStream,
  ResolvedReturnValue,
  ResolvedToolCall,
} from "./resolvers";
import { ResponseMetrics } from "./session";

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
    const { libretto, messages, stream, tools, ...openaiBody } = body;

    const { messages: resolvedMessages, template } = getResolvedMessages(
      messages,
      libretto?.templateParams,
    );

    const resultPromise = super.create(
      { ...openaiBody, messages: resolvedMessages, tools: tools, stream },
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

    const sendEventPromise = finalResultPromise
      .then(async ({ response, tool_calls, responseMetrics }) => {
        const responseTime = Date.now() - now;
        let params = libretto?.templateParams ?? {};

        // Redact PII before recording the event
        if (this.piiRedactor) {
          const redactor = this.piiRedactor;
          try {
            response = redactor.redact(response);
            params = redactor.redact(params);
            tool_calls = tool_calls?.map((tool_call) => ({
              ...tool_call,
              function: {
                ...tool_call.function,
                arguments: redactor.redact(tool_call?.function?.arguments),
              },
            }));
          } catch (err) {
            console.log("Failed to redact PII", err);
          }
        }

        await this.prepareAndSendEvent({
          responseTime,
          response,
          rawResponse: returnValue,
          params,
          feedbackKey,
          template,
          resolvedPromptTemplateName,
          resolvedMessages,
          tools,
          responseMetrics,
          librettoParams: libretto,
          openaiBody,
          toolCalls: tool_calls,
        });
      })
      .catch(async (error) => {
        const responseTime = Date.now() - now;
        // Capture OpenAI API errors here
        let params = libretto?.templateParams ?? {};

        // Redact PII before recording the event
        if (this.piiRedactor) {
          const redactor = this.piiRedactor;
          try {
            params = redactor.redact(params);
          } catch (err) {
            console.warn("Failed to redact PII", err);
          }
        }
        await this.prepareAndSendEvent({
          responseTime,
          responseErrors: [JSON.stringify(error.response)],
          params,
          feedbackKey,
          template,
          resolvedPromptTemplateName,
          resolvedMessages,
          tools,
          librettoParams: libretto,
          openaiBody,
        });
      });

    if (this.config.waitForEvent) {
      await sendEventPromise;
    }

    return returnValue as ChatCompletion | Stream<ChatCompletionChunk>;
  }

  protected async prepareAndSendEvent({
    response,
    rawResponse,
    responseTime,
    responseErrors,
    params,
    librettoParams,
    responseMetrics,
    template,
    resolvedMessages,
    resolvedPromptTemplateName,
    openaiBody,
    feedbackKey,
    tools,
    toolCalls,
  }: {
    response?: string | null | undefined;
    rawResponse?: null | ResolvedReturnValue;
    responseTime?: number;
    responseErrors?: string[];
    params: Record<string, any>;
    librettoParams: LibrettoCreateParams | undefined;
    template: Core.Chat.Completions.ChatCompletionMessageParam[] | null;
    resolvedMessages: Core.Chat.Completions.ChatCompletionMessageParam[];
    resolvedPromptTemplateName?: string | undefined;
    responseMetrics?: ResponseMetrics;
    openaiBody: any;
    feedbackKey?: string;
    tools: Core.Chat.Completions.ChatCompletionTool[] | undefined;
    toolCalls?: ResolvedToolCall[];
  }) {
    await send_event({
      responseTime,
      response,
      rawResponse,
      responseErrors,
      responseMetrics,
      params: params,
      apiKey:
        librettoParams?.apiKey ??
        this.config.apiKey ??
        process.env.LIBRETTO_API_KEY,
      promptTemplateChat:
        librettoParams?.templateChat ?? template ?? resolvedMessages,
      promptTemplateName: resolvedPromptTemplateName,
      apiName:
        librettoParams?.promptTemplateName ?? this.config.promptTemplateName,
      prompt: {},
      chatId: librettoParams?.chatId ?? this.config.chatId,
      chainId: librettoParams?.chainId ?? librettoParams?.parentEventId,
      feedbackKey,
      modelParameters: {
        modelProvider: "openai",
        modelType: "chat",
        ...openaiBody,
      },
      tools,
      toolCalls,
    });
  }
}
