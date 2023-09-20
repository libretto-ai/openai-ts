# im-openai-ts

TypeScript wrapper around openai library to send events to templatest

## Installation

```bash
npm install im-openai-ts
```

## Usage

To use this library, you need to patch the openai library. This will time calls to OpenAI, and report them to Templatest.

You'll need an API key from Templatest. Set it in the environment variable `PROMPT_API_KEY` or pass it directly to the `patch()` call. You'll also probably want to name which template you are using.

```typescript
import { patch, objectTemplate } from "im-openai-ts";
import OpenAI from "openai";

async function main() {
  patch({
    apiKey: "XXX", // defaults to process.env.PROMPT_API_KEY
    // You can set this here for in the `create` call:
    // promptTemplateName: "my-template-test"
  });
  const openai = new OpenAI({
    apiKey: "YYY", // defaults to process.env.OPENAI_API_KEY
  });

  const completion = await openai.chat.completions.create({
    // Instead of a chat message array, you can pass objectTemplate instead.
    messages: objectTemplate([
      { role: "user", content: "Give a hearty welcome to our new user {name}" },
    ]) as any,
    model: "gpt-3.5-turbo",
    // Uniquely identifies this prompt within your project. Equivalent to passing `promptTemplateName` to `patch()`.
    ip_prompt_template_name: "ts-client-test-chat",
    // The parameters to fill in the template.
    ip_template_params: { name: "John" },
  });

  console.log(completion.choices);
}

main();
```

#### Advanced Usage

You can "unpatch" the library by calling `unpatch()`. This will restore the original `create` method on the `chat.completions` object.

```typescript
import { patch, objectTemplate } from "im-openai-ts";

const unpatch = patch();

try {
    const completion = await openai.chat.completions.create({...});
} finally {
    unpatch();
}
```

### Additional Parameters

The following parameters are added to the `create` call:

- `ip_template_params`: The parameters to use for template
  strings. This is a dictionary of key-value pairs.
- `ip_chat_id`: The id of a "chat session" - if the chat API is
  being used in a conversational context, then the same chat id can be
  provided so that the events are grouped together, in order. If not provided,
  this will be left blank.
- `ip_only_named_prompts`: When passed to `patched_openai()` or `patch_openai()`,
  this will only send events for prompts that have a name. This is useful if
  you have a mix of prompts you want to track and prompts you don't want to track.
- `ip_template_chat`: The chat _template_ to record for chat
  requests. This is a list of dictionaries with the following keys:

  - `role`: The role of the speaker. Either `"system"`, `"user"` or `"ai"`.
  - `content`: The content of the message. This can be a string or a template string with `{}` placeholders.

- `ip_template_text`: The text template to record for non-chat
  completion requests. This is a string or a template string with `{}`
  placeholders,
- `ip_parent_event_id`: The UUID of the parent event. All calls with the same
  parent id are grouped as a "Run Group".

- `ip_feedback_key`: The key used to send feedback on the prompt. This should be used in conjunction with the send_feedback
