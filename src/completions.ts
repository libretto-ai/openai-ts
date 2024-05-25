import Anthropic from "@anthropic-ai/sdk";
import Core, { APIPromise } from "@anthropic-ai/sdk/core";
import { CompletionCreateParamsBase } from "@anthropic-ai/sdk/resources/completions";
import { Stream } from "@anthropic-ai/sdk/streaming";
import crypto from "crypto";
import { LibrettoConfig, send_event } from ".";
import { PiiRedactor } from "./pii";
import { getResolvedPrompt, getResolvedStream } from "./resolvers";

export class LibrettoCompletions extends Anthropic.Completions {
  protected piiRedactor?: PiiRedactor;

  constructor(
    client: Anthropic,
    protected config: LibrettoConfig,
  ) {
    super(client);

    if (config.redactPii) {
      this.piiRedactor = new PiiRedactor();
    }
  }

  override create(
    body: Anthropic.Completions.CompletionCreateParamsNonStreaming,
    options?: Core.RequestOptions,
  ): APIPromise<Anthropic.Completions.Completion>;
  override create(
    body: Anthropic.Completions.CompletionCreateParamsStreaming,
    options?: Core.RequestOptions,
  ): APIPromise<Stream<Anthropic.Completions.Completion>>;
  override create(
    body: CompletionCreateParamsBase,
    options?: Core.RequestOptions,
  ): APIPromise<
    Stream<Anthropic.Completions.Completion> | Anthropic.Completions.Completion
  >;
  override create(
    body: Anthropic.Completions.CompletionCreateParams,
    options?: Core.RequestOptions,
  ):
    | APIPromise<Anthropic.Completions.Completion>
    | APIPromise<Stream<Anthropic.Completions.Completion>> {
    return this._create(body, options) as
      | APIPromise<Anthropic.Completions.Completion>
      | APIPromise<Stream<Anthropic.Completions.Completion>>;
  }

  private async _create(
    body: Anthropic.Completions.CompletionCreateParams,
    options?: Core.RequestOptions,
  ): Promise<
    Anthropic.Completions.Completion | Stream<Anthropic.Completions.Completion>
  > {
    const now = Date.now();
    const { libretto, prompt, stream, ...anthropicBody } = body;

    const { prompt: resolvedPrompt, template } = getResolvedPrompt(
      prompt,
      libretto?.templateParams,
    );

    const resultPromise = super.create(
      { ...anthropicBody, prompt: resolvedPrompt, stream },
      options,
    ) as
      | APIPromise<Anthropic.Completions.Completion>
      | APIPromise<Stream<Anthropic.Completions.Completion>>;

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
          stop_reason,
        },
        params: params,
        apiKey:
          libretto?.apiKey ??
          this.config.apiKey ??
          process.env.LIBRETTO_API_KEY,
        promptTemplateText:
          libretto?.templateText ?? template ?? resolvedPromptStr,
        promptTemplateName: resolvedPromptTemplateName,
        apiName: libretto?.promptTemplateName ?? this.config.promptTemplateName,
        prompt: {},
        chatId: libretto?.chatId ?? this.config.chatId,
        parentEventId: libretto?.parentEventId,
        context: libretto?.context,
        feedbackKey,
        modelParameters: {
          modelProvider: "anthropic",
          modelType: "completion",
          ...anthropicBody,
        },
      });
    });

    return returnValue as
      | Anthropic.Completions.Completion
      | Stream<Anthropic.Completions.Completion>;
  }
}
