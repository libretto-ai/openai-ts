import crypto from "crypto";
import Core, { OpenAI } from "openai";
import { APIPromise } from "openai/core";
import {
  Completion,
  CompletionCreateParams,
  CompletionCreateParamsBase,
  CompletionCreateParamsNonStreaming,
  CompletionCreateParamsStreaming,
  Completions,
} from "openai/resources/completions";
import { Stream } from "openai/streaming";
import { LibrettoConfig, LibrettoCreateParams, send_event } from ".";
import { PiiRedactor } from "./pii";
import { getResolvedPrompt, getResolvedStream } from "./resolvers";
import { ResponseMetrics } from "./session";

export class LibrettoCompletions extends Completions {
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
    body: CompletionCreateParamsNonStreaming,
    options?: Core.RequestOptions,
  ): APIPromise<Completion>;
  override create(
    body: CompletionCreateParamsStreaming,
    options?: Core.RequestOptions,
  ): APIPromise<Stream<Completion>>;
  override create(
    body: CompletionCreateParamsBase,
    options?: Core.RequestOptions,
  ): APIPromise<Stream<Completion> | Completion>;
  override create(
    body: CompletionCreateParams,
    options?: Core.RequestOptions,
  ): APIPromise<Completion> | APIPromise<Stream<Completion>> {
    return this._create(body, options) as
      | APIPromise<Completion>
      | APIPromise<Stream<Completion>>;
  }

  private async _create(
    body: CompletionCreateParams,
    options?: Core.RequestOptions,
  ): Promise<Completion | Stream<Completion>> {
    const now = Date.now();
    const { libretto, prompt, stream, ...openaiBody } = body;

    const { prompt: resolvedPrompt, template } = getResolvedPrompt(
      prompt,
      libretto?.templateParams,
    );

    const resultPromise = super.create(
      { ...openaiBody, prompt: resolvedPrompt, stream },
      options,
    ) as APIPromise<Completion> | APIPromise<Stream<Completion>>;

    const resolvedPromptStr = Array.isArray(resolvedPrompt)
      ? null
      : resolvedPrompt;

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

    const sendEventPromise = finalResultPromise
      .then(async ({ response, responseMetrics }) => {
        const responseTime = Date.now() - now;
        let params = libretto?.templateParams ?? {};

        // Redact PII before recording the event
        if (this.piiRedactor) {
          try {
            response = this.piiRedactor.redact(response);
            params = this.piiRedactor.redact(params);
          } catch (err) {
            console.warn("Failed to redact PII", err);
          }
        }

        await this.prepareAndSendEvent({
          responseTime,
          response,
          responseMetrics,
          params,
          template,
          resolvedPromptStr,
          resolvedPromptTemplateName,
          feedbackKey,
          openaiBody,
          librettoParams: libretto,
        });
      })
      .catch(async (error) => {
        let params = libretto?.templateParams ?? {};
        const responseTime = Date.now() - now;
        // Redact PII before recording the event
        if (this.piiRedactor) {
          const redactor = this.piiRedactor;
          try {
            params = redactor.redact(params);
          } catch (err) {
            console.log("Failed to redact PII", err);
          }
        }

        await this.prepareAndSendEvent({
          responseErrors: [JSON.stringify(error.response)],
          responseTime,
          resolvedPromptStr,
          resolvedPromptTemplateName,
          params,
          template,
          librettoParams: libretto,
          feedbackKey,
          openaiBody,
        });
      });

    if (this.config.waitForEvent) {
      await sendEventPromise;
    }

    return returnValue as Completion | Stream<Completion>;
  }

  private async prepareAndSendEvent({
    response,
    responseTime,
    responseErrors,
    params,
    librettoParams,
    responseMetrics,
    template,
    resolvedPromptTemplateName,
    openaiBody,
    feedbackKey,
    resolvedPromptStr,
  }: {
    response?: string | null | undefined;
    responseTime?: number;
    responseErrors?: string[];
    params: Record<string, any>;
    librettoParams: LibrettoCreateParams | undefined;
    template: string | null;
    resolvedPromptTemplateName?: string | undefined;
    responseMetrics?: ResponseMetrics;
    openaiBody: any;
    feedbackKey?: string;
    resolvedPromptStr?: string | null;
  }) {
    await send_event({
      responseTime,
      response,
      responseErrors,
      responseMetrics,
      params,
      apiKey:
        librettoParams?.apiKey ??
        this.config.apiKey ??
        process.env.LIBRETTO_API_KEY,
      promptTemplateText:
        librettoParams?.templateText ?? template ?? resolvedPromptStr,
      promptTemplateName: resolvedPromptTemplateName,
      apiName:
        librettoParams?.promptTemplateName ?? this.config.promptTemplateName,
      prompt: {},
      chatId: librettoParams?.chatId ?? this.config.chatId,
      chainId: librettoParams?.chainId ?? librettoParams?.parentEventId,
      context: librettoParams?.context,
      feedbackKey,
      modelParameters: {
        modelProvider: "openai",
        modelType: "completion",
        ...openaiBody,
      },
    });
  }
}
