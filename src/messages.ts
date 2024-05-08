import { OpenAI } from "openai";
import { PagePromise, RequestOptions, isRequestOptions } from "openai/core";
import {
  Message,
  MessageListParams,
  Messages,
  MessagesPage,
} from "openai/resources/beta/threads/messages";
import { LibrettoConfig, send_event } from ".";

class ThreadFollower {
  constructor(
    protected client: OpenAI,
    protected originalClientMessages: Messages,
  ) {}

  async checkForUpdates(assistantId: string, threadId: string) {
    const assistant = await this.client.beta.assistants.retrieve(assistantId);

    const thread = await this.client.beta.threads.retrieve(threadId);
    const threadMetadata = (thread.metadata as Record<string, any>) ?? {};
    const cursor = threadMetadata["libretto.cursor"] ?? "";

    const messagePage = await this.originalClientMessages.list(threadId, {
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
      promptTemplateName: assistant.name ?? assistant.id,
      apiName: assistant.name ?? assistant.id,
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

export class LibrettoMessages extends Messages {
  protected threadFollower: ThreadFollower;

  constructor(
    client: OpenAI,
    protected config: LibrettoConfig,
  ) {
    super(client);
    this.threadFollower = new ThreadFollower(
      client,
      client.beta.threads.messages,
    );
  }

  override list(
    threadId: string,
    query?: MessageListParams,
    options?: RequestOptions,
  ): PagePromise<MessagesPage, Message>;
  override list(
    threadId: string,
    options?: RequestOptions,
  ): PagePromise<MessagesPage, Message>;
  override list(
    threadId: string,
    query: MessageListParams | RequestOptions = {},
    options?: RequestOptions,
  ): PagePromise<MessagesPage, Message> {
    return this._list(threadId, query, options) as PagePromise<
      MessagesPage,
      Message
    >;
  }

  private async _list(
    threadId: string,
    query: MessageListParams | RequestOptions = {},
    options?: RequestOptions,
  ) {
    const resp = isRequestOptions(query)
      ? await super.list(threadId, {}, query)
      : await super.list(threadId, query, options);

    if (resp.data.length === 0) {
      return resp;
    }

    const assistantId = resp.data[0].assistant_id;
    if (!assistantId) {
      return resp;
    }

    // Asynchronously check the thread for messages we haven't seen before
    this.threadFollower.checkForUpdates(assistantId, threadId);

    return resp;
  }
}
