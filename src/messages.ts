import OpenAI from "openai";
import { APIPromise, RequestOptions } from "openai/core";
import {
  Message,
  MessageDeleted,
  Messages,
} from "openai/resources/beta/threads/messages";
import { LibrettoConfig, sendFeedback } from ".";
import { LibrettoThreads } from "./threads";

export class LibrettoMessages extends Messages {
  constructor(
    protected client: OpenAI,
    protected config: LibrettoConfig,
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
    // Check if the message being deleted is the current thread cursor.
    // If it is, we need to update the cursor before allowing the message to be deleted.
    const cursor = await (
      this.client.beta.threads as LibrettoThreads
    ).getCursor(threadId);
    if (cursor === messageId) {
      const prevMessage = await this.findPreviousMessage(threadId, messageId);
      const newCursor = prevMessage !== null ? prevMessage.id : "";
      await (this.client.beta.threads as LibrettoThreads).setCursor(
        threadId,
        newCursor,
      );
    }

    // Mark the message as deleted in Libretto
    await sendFeedback({
      feedbackKey: messageId,
      isDeleted: true,
    });

    return super.del(threadId, messageId, options);
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
