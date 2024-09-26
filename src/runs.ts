import { OpenAI } from "openai";
import { RequestOptions } from "openai/core";
import {
  Run,
  RunCreateParamsNonStreaming,
  Runs,
} from "openai/resources/beta/threads/runs/runs";
import { LibrettoConfig, LibrettoRunCreateParams, send_event } from ".";
import { ThreadManager } from "./assistants";

type RunParams = {
  runId: string;
  opts?: LibrettoRunCreateParams;
};

export class LibrettoRuns extends Runs {
  constructor(
    protected client: OpenAI,
    protected config: LibrettoConfig,
    protected threadManager: ThreadManager,
  ) {
    super(client);
  }

  override createAndPoll(
    threadId: string,
    body: RunCreateParamsNonStreaming,
    options?:
      | (RequestOptions & {
          pollIntervalMs?: number | undefined;
        })
      | undefined,
  ): Promise<Run> {
    return this._createAndPoll(threadId, body, options);
  }

  private async _createAndPoll(
    threadId: string,
    body: RunCreateParamsNonStreaming,
    options?:
      | (RequestOptions & {
          pollIntervalMs?: number | undefined;
        })
      | undefined,
  ) {
    const { libretto, ...rest } = body;

    const resp = await super.createAndPoll(threadId, rest, options);

    if (libretto && libretto.promptTemplateName) {
      this.threadManager.enqueue(threadId, () => {
        return this.handleRun(threadId, rest, {
          runId: resp.id,
          opts: {
            apiKey: libretto.apiKey,
            promptTemplateName: libretto.promptTemplateName,
          },
        });
      });
    }

    return resp;
  }

  protected async handleRun(
    threadId: string,
    runCreateParams: RunCreateParamsNonStreaming,
    librettoParams: RunParams,
  ) {
    const run = await this.client.beta.threads.runs.poll(
      threadId,
      librettoParams.runId,
    );

    const assistant = await this.client.beta.assistants.retrieve(
      run.assistant_id,
    );

    if (
      run.status === "failed" ||
      run.status === "cancelled" ||
      run.status === "incomplete"
    ) {
      await this.prepareAndSendEvent({
        runCreateParams,
        librettoParams,
        responseErrors: [JSON.stringify(run.last_error)],
        chatId: threadId,
        assistant,
        params: {},
      });
      return;
    }

    if (run.status !== "completed") {
      if (process.env.LIBRETTO_DEBUG === "true") {
        console.log(
          `[Libretto] Assistant thread run did not complete, ignoring: threadId=${threadId} runId=${librettoParams.runId}`,
        );
      }
      return;
    }

    const cursor = await this.threadManager.getCursor(threadId);

    const messagePage = await this.client.beta.threads.messages.list(threadId, {
      after: cursor,
      order: "asc",
      limit: 100,
    });
    const messages = messagePage.data;
    if (messages.length === 0) {
      return;
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.content.length === 0 || msg.content[0].type !== "text") {
        console.log(
          `[Libretto] Skipping unsupported assistant message: ${JSON.stringify(msg)}`,
        );
        continue;
      }
      await this.prepareAndSendEvent({
        response: msg.content[0].text.value,
        runCreateParams,
        librettoParams,
        assistant,
        chatId: msg.id,
        params: {
          chat_history: [
            {
              role: msg.role,
              content: msg.content[0].text.value,
            },
          ],
        },
      });

      await this.threadManager.setCursor(threadId, msg.id);
    }
  }
  protected async prepareAndSendEvent({
    params,
    librettoParams,
    runCreateParams,
    assistant,
    chatId,
    feedbackKey,
    response,
    responseErrors,
  }: {
    response?: string | null | undefined;
    params: Record<string, any>;
    librettoParams: RunParams;
    runCreateParams: RunCreateParamsNonStreaming;
    assistant: OpenAI.Beta.Assistants.Assistant;
    chatId: string;
    feedbackKey?: string;
    responseErrors?: string[];
  }) {
    await send_event({
      responseTime: 1,
      response,
      responseErrors,
      params,
      apiKey:
        librettoParams?.opts?.apiKey ??
        this.config.apiKey ??
        process.env.LIBRETTO_API_KEY,
      promptTemplateChat: [
        {
          role: "assistant",
          content: assistant.instructions,
        },
        {
          role: "chat_history",
          content: "{chat_history}",
        },
      ],
      modelParameters: {
        modelProvider: "openai",
        modelType: "assistants",
        model: runCreateParams.model ?? assistant.model,
        ...runCreateParams,
      },
      promptTemplateName: assistant.name ?? assistant.id,
      apiName:
        librettoParams?.opts?.promptTemplateName ??
        assistant.name ??
        assistant.id,
      prompt: {},
      chatId,
      feedbackKey,
    });
  }
}
