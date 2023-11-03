# @libretto/openai

TypeScript wrapper around openai library to send events to Libretto

## Installation

```bash
npm install @libretto/openai
```

## Usage

To use this library, you need to patch the openai library. This will time calls to OpenAI, and report them to Libretto.

You'll need an API key from Libretto. Set it in the environment variable `LIBRETTO_API_KEY` or pass it directly to the `patch()` call. You'll also probably want to name which template you are using.

```typescript
import { patch, objectTemplate } from "@libretto/openai";
import OpenAI from "openai";

async function main() {
  patch({
    apiKey: "XXX", // defaults to process.env.LIBRETTO_API_KEY
    // You can set this here or in the `create` call:
    // promptTemplateName: "my-template-test"
    OpenAI,
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
    libretto: {
      // Uniquely identifies this prompt within your project. Equivalent to
      // passing `promptTemplateName` to `patch()`.
      promptTemplateName: "ts-client-test-chat",
      // The parameters to fill in the template.
      templateParams: { name: "John" },
    },
  });

  console.log(completion.choices);
}

main();
```

### Advanced Usage

You can "unpatch" the library by calling `unpatch()`. This will restore the original `create` method on the `chat.completions` object.

```typescript
import { patch, objectTemplate } from "@libretto/openai";
import OpenAI from "openai";

const unpatch = patch({ OpenAI });

try {
    const completion = await openai.chat.completions.create({...});
} finally {
    unpatch();
}
```

### Configuration

The following options may be passed to `patch`:

- `promptTemplateName`: A default name to associate with prompts. If provided,
  this is the name that will be associated with any `create` call that's made
  **without** a `libretto.promptTemplateName` parameter.
- `allowUnnamedPrompts`: When set to `true`, every prompt will be sent to
  Libretto even if no prompt template name as been provided (either via the
  `promptTemplateName` option on `patch` or via the `libretto.promptTemplateName`
  parameter added to `create`).
- `redactPii`: When `true`, certain personally identifying information (PII)
  will be attempted to be redacted before being sent to the Libretto backend.
  See the `pii` package for details about the types of PII being detected/redacted.
  `false` by default.

### Additional Parameters

The following parameters can be specified in the `libretto` object that has been
added to the base OpenAI `create` call interface:

- `templateParams`: The parameters to use for template strings. This is a
  dictionary of key-value pairs.
- `chatId`: The id of a "chat session" - if the chat API is being used in a
  conversational context, then the same chat id can be provided so that the
  events are grouped together, in order. If not provided, this will be left
  blank.
- `templateChat`: The chat _template_ to record for chat requests. This is a
  list of dictionaries with the following keys:
  - `role`: The role of the speaker. Either `"system"`, `"user"` or `"ai"`.
  - `content`: The content of the message. This can be a string or a template
    string with `{}` placeholders.
- `templateText`: The text template to record for non-chat completion requests.
  This is a string or a template string with `{}` placeholders.
- `parentEventId`: The UUID of the parent event. All calls with the same
  parent id are grouped as a "Run Group".
- `feedbackKey`: The optional key used to send feedback on the prompt, for
  use with `sendFeedback()` later. This is normally auto-generated, and the
  value is returned in the OpenAI response.

## Sending Feedback

Sometimes the answer provided by the LLM is not ideal, and your users may be
able to help you find better responses. There are a few common cases:

- You might use the LLM to suggest the title of a news article, but let the
  user edit it. If they change the title, you can send feedback to Libretto
  that the answer was not ideal.
- You might provide a chatbot that answers questions, and the user can rate the  
  answers with a thumbs up (good) or thumbs down (bad).

You can send this feedback to Tepmlatest by calling `sendFeedback()`. This will
send a feedback event to Libretto about a prompt that was previously called, and
let you review this feedback in the Libretto dashboard. You can use this
feedback to develop new tests and improve your prompts.

```typescript
import { patch, sendFeedback } from "@libretto/openai";
import crypto from "crypto";
import OpenAI from "openai";

async function main() {
  patch({ OpenAI });

  // Must be unique for each call to OpenAI
  const completion = await openai.chat.completions.create({
    // ...
  });

  // Maybe the user didn't like the answer, so ask them for a better one.
  const betterAnswer = await askUserForBetterResult(completion.choices[0].text);

  // If the user provided a better answer, send feedback to Libretto
  if (betterAnswer !== completion.choices[0].text) {
    // feedback key is automatically injected into OpenAI response object.
    const feedbackKey = completion.libretto.feedbackKey;
    await sendFeedback({
      apiKey,
      feedbackKey,
      // Better answer from the user
      betterResponse: betterAnswer,
      // Rating of existing answer, from 0 to 1
      rating: 0.2,
    });
  }
}
```

Note that feedback can include either `rating`, `betterResponse`, or both.

Parameters:

- `rating` - a value from 0 (meaning the result was completely wrong) to 1 (meaning the result was correct)
- `betterResponse` - the better response from the user
