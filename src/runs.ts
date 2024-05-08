import { OpenAI } from "openai";
import { RequestOptions } from "openai/core";
import {
  Run,
  RunCreateParamsNonStreaming,
  Runs,
} from "openai/resources/beta/threads/runs/runs";
import { LibrettoConfig, send_event } from ".";

class RunObserver {
  protected threadQueues: Record<string, string[]> = {};

  constructor(protected client: OpenAI) {}

  addRun(threadId: string, runId: string) {
    const queue = this.threadQueues[threadId];

    // If another run is already being processed for this thread, just enqueue this new run.
    // The worker that's handling the existing run(s) will eventually process this one too.
    if (queue && queue.length > 0) {
      queue.push(runId);
      return;
    }

    // No work is currently being done on this thread, so start a worker to process this run.
    this.threadQueues[threadId] = [runId];
    this.handleThread(threadId);
  }

  protected async handleThread(threadId: string) {
    for (;;) {
      const runId = this.threadQueues[threadId].shift();
      if (!runId) {
        delete this.threadQueues[threadId];
        break;
      }

      try {
        await this.handleRun(threadId, runId);
      } catch (err) {
        console.error(
          `[Libretto] Failed to handle Assistant thread run: ${err}`,
        );
      }
    }
  }

  protected async handleRun(threadId: string, runId: string) {
    const run = await this.client.beta.threads.runs.poll(threadId, runId);
    if (run.status !== "completed") {
      console.log(
        `[Libretto] Assistant thread run did not complete, ignoring: threadId=${threadId} runId=${runId}`,
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
    const latestMessage = messages[messages.length - 1];

    await send_event({
      responseTime: 1,
      response:
        latestMessage.content[0].type === "text"
          ? latestMessage.content[0].text.value
          : "",
      params: {
        chat_history: messages.map((msg) => {
          if (msg.content.length === 0 || msg.content[0].type !== "text") {
            throw new Error(`Unexpected message: ${JSON.stringify(msg)}`);
          }
          return {
            role: msg.role,
            content: msg.content[0].text.value,
          };
        }),
      },
      apiKey: process.env.LIBRETTO_API_KEY,
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
      // promptTemplateName: assistant.name ?? assistant.id,
      // apiName: assistant.name ?? assistant.id,
      promptTemplateName: assistant.id,
      apiName: assistant.id,
      prompt: {},
      chatId: threadId,
      // parentEventId: libretto?.parentEventId,
    });

    await this.client.beta.threads.update(threadId, {
      metadata: {
        "libretto.cursor": latestMessage.id,
      },
    });
  }
}

export class LibrettoRuns extends Runs {
  protected runObserver: RunObserver;

  constructor(
    client: OpenAI,
    protected config: LibrettoConfig,
  ) {
    super(client);
    this.runObserver = new RunObserver(client);
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
    const resp = await super.createAndPoll(threadId, body, options);
    this.runObserver.addRun(threadId, resp.id);
    return resp;
  }

  // override create(
  //   threadId: string,
  //   body: RunCreateParamsNonStreaming,
  //   options?: RequestOptions | undefined,
  // ): APIPromise<Run>;
  // override create(
  //   threadId: string,
  //   body: RunCreateParamsStreaming,
  //   options?: RequestOptions | undefined,
  // ): APIPromise<Stream<AssistantStreamEvent>>;
  // override create(
  //   threadId: string,
  //   body: RunCreateParamsBase,
  //   options?: RequestOptions | undefined,
  // ): APIPromise<Run | Stream<AssistantStreamEvent>>;
  // override create(
  //   threadId: string,
  //   body: RunCreateParams,
  //   options?: RequestOptions,
  // ): APIPromise<Run> | APIPromise<Stream<AssistantStreamEvent>> {
  //   const resp = super.create(threadId, body, options) as
  //     | APIPromise<Run>
  //     | APIPromise<Stream<AssistantStreamEvent>>;
  //   return resp;
  // }
}
