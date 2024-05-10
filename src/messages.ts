import { OpenAI } from "openai";
import { PagePromise, RequestOptions, isRequestOptions } from "openai/core";
import {
  Message,
  MessageListParams,
  Messages,
  MessagesPage,
} from "openai/resources/beta/threads/messages";
import { LibrettoConfig } from ".";

export class LibrettoMessages extends Messages {
  constructor(
    client: OpenAI,
    protected config: LibrettoConfig,
  ) {
    super(client);
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

    return resp;
  }
}
