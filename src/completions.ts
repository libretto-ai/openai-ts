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
import { LibrettoConfig, send_event } from ".";
import { PiiRedactor } from "./pii";
import { getResolvedPrompt, getResolvedStream } from "./resolvers";

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

    // note: not awaiting the result of this
    finalResultPromise.then(
      async ({ response, finish_reason, logprobs, usage }) => {
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
            finish_reason,
            logprobs,
          },
          params: params,
          apiKey:
            libretto?.apiKey ??
            this.config.apiKey ??
            process.env.LIBRETTO_API_KEY,
          promptTemplateText:
            libretto?.templateText ?? template ?? resolvedPromptStr,
          promptTemplateName: resolvedPromptTemplateName,
          apiName:
            libretto?.promptTemplateName ?? this.config.promptTemplateName,
          prompt: {},
          chatId: libretto?.chatId ?? this.config.chatId,
          parentEventId: libretto?.parentEventId,
          context: libretto?.context,
          feedbackKey,
          modelParameters: {
            modelProvider: "openai",
            modelType: "completion",
            ...openaiBody,
          },
        });
      },
    );

    return returnValue as Completion | Stream<Completion>;
  }
}
