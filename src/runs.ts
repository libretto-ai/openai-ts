import { OpenAI } from "openai";
import { RequestOptions } from "openai/core";
import {
  Run,
  RunCreateParamsNonStreaming,
  Runs,
} from "openai/resources/beta/threads/runs/runs";
import { LibrettoConfig, LibrettoRunCreateParams, send_event } from ".";

type RunParams = {
  runId: string;
  opts?: LibrettoRunCreateParams;
};

class RunObserver {
  protected threadQueues: Record<string, RunParams[]> = {};

  constructor(
    protected client: OpenAI,
    protected config: LibrettoConfig,
  ) {}

  addRun(threadId: string, params: RunParams) {
    const queue = this.threadQueues[threadId];

    // If another run is already being processed for this thread, just enqueue this new run.
    // The handleThread invocation that's processing the existing run(s) will eventually pick
    // up this one too.
    if (queue && queue.length > 0) {
      queue.push(params);
      return;
    }

    // No work is currently being done on this thread, so invoke an asynchronous handler to
    // start processing the run.
    this.threadQueues[threadId] = [params];
    this.handleThread(threadId);
  }

  protected async handleThread(threadId: string) {
    for (;;) {
      const runParams = this.threadQueues[threadId].shift();
      if (!runParams) {
        delete this.threadQueues[threadId];
        break;
      }

      try {
        await this.handleRun(threadId, runParams);
      } catch (err) {
        console.error(
          `[Libretto] Failed to handle Assistant thread run: ${err}`,
        );
      }
    }
  }

  protected async handleRun(threadId: string, params: RunParams) {
    const run = await this.client.beta.threads.runs.poll(
      threadId,
      params.runId,
    );
    if (run.status !== "completed") {
      console.log(
        `[Libretto] Assistant thread run did not complete, ignoring: threadId=${threadId} runId=${params.runId}`,
      );
      return;
    }

    const assistant = await this.client.beta.assistants.retrieve(
      run.assistant_id,
    );

    const thread = await this.client.beta.threads.retrieve(threadId);
    const threadMetadata = (thread.metadata as Record<string, any>) ?? {};
    const cursor = threadMetadata["libretto.cursor"] ?? "";

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

      await send_event({
        responseTime: 1,
        response: msg.content[0].text.value,
        params: {
          chat_history: [
            {
              role: msg.role,
              content: msg.content[0].text.value,
            },
          ],
        },
        apiKey:
          params.opts?.apiKey ??
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
        promptTemplateName: assistant.name ?? assistant.id,
        apiName:
          params.opts?.promptTemplateName ?? assistant.name ?? assistant.id,
        prompt: {},
        chatId: threadId,
        feedbackKey: msg.id,
      });

      await this.client.beta.threads.update(threadId, {
        metadata: {
          "libretto.cursor": msg.id,
        },
      });
    }
  }
}

export class LibrettoRuns extends Runs {
  protected runObserver: RunObserver;

  constructor(
    client: OpenAI,
    protected config: LibrettoConfig,
  ) {
    super(client);
    this.runObserver = new RunObserver(client, config);
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
      this.runObserver.addRun(threadId, {
        runId: resp.id,
        opts: {
          apiKey: libretto.apiKey,
          promptTemplateName: libretto.promptTemplateName,
        },
      });
    }
    return resp;
  }
}
