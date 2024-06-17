import OpenAI from "openai";
import { APIPromise, RequestOptions } from "openai/core";
import {
  Message,
  MessageDeleted,
  Messages,
} from "openai/resources/beta/threads/messages";
import { LibrettoConfig, sendFeedback } from ".";
import { ThreadManager } from "./assistants";

export class LibrettoMessages extends Messages {
  constructor(
    protected client: OpenAI,
    protected config: LibrettoConfig,
    protected threadManager: ThreadManager,
  ) {
    super(client);
  }

  override del(
    threadId: string,
    messageId: string,
    options?: RequestOptions | undefined,
  ): APIPromise<MessageDeleted> {
    return this._del(
      threadId,
      messageId,
      options,
    ) as APIPromise<MessageDeleted>;
  }

  private async _del(
    threadId: string,
    messageId: string,
    options?: RequestOptions | undefined,
  ): Promise<MessageDeleted> {
    // Enqueue the deletion and block:
    // We need to wait for all of the Libretto deletion bookkeeping to happen before allowing
    // the message to be deleted in OpenAI because certain tasks, like querying for the previous
    // message to update the cursor, will fail if the message has already been deleted.
    await new Promise<void>((resolve) => {
      this.threadManager.enqueue(threadId, async () => {
        try {
          await this.handleDelete(threadId, messageId);
        } finally {
          resolve();
        }
      });
    });

    return super.del(threadId, messageId, options);
  }

  private async handleDelete(threadId: string, messageId: string) {
    // Check if the message being deleted is the current thread cursor.
    // If it is, we need to update the cursor before allowing the message to be deleted.
    const cursor = await this.threadManager.getCursor(threadId);
    if (cursor === messageId) {
      const prevMessage = await this.findPreviousMessage(threadId, messageId);
      const newCursor = prevMessage !== null ? prevMessage.id : "";
      await this.threadManager.setCursor(threadId, newCursor);
    }

    // Mark the message as deleted in Libretto
    await sendFeedback({
      feedbackKey: messageId,
      isDeleted: true,
      apiKey: this.config.apiKey,
    });
  }

  private async findPreviousMessage(
    threadId: string,
    messageId: string,
  ): Promise<Message | null> {
    const messagePage = await this.client.beta.threads.messages.list(threadId, {
      after: messageId,
      order: "desc",
      limit: 1,
    });
    const messages = messagePage.data;
    return messages.length > 0 ? messages[0] : null;
  }
}
