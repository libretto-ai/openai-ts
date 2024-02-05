# @libretto/openai

A drop-in replacement of the official `OpenAI` client for sending events to Libretto.

## Installation

```bash
npm install @libretto/openai
```

## Get Started

To send events to Libretto, you'll need to create a project. From the project you'll need two things:

1. **API key**: (`apiKey`) This is generated for the project and is used to identify the project and environment (dev, staging, prod) that the event is coming from.
2. **Template Name**: (`promptTemplateName`) This uniquely identifies a particular prompt that you are using and allows projects to have multiple prompts. This can be in any format but we recommend using a dash-separated format, e.g. `my-prompt-name`.

**Note:** Prompt template names can be auto-generated if the `allowUnnamedPrompts` configuration option is set (see [below](#configuration)). However, if you rely on auto-generated names, new revisions of the same prompt will show up as different prompt templates in Libretto.

## Usage

You can use the `OpenAI` client provided by `@libretto/openai` anywhere that you're currently using the official client.

When instantiating the client, you can/should provide any of the standard `OpenAI` parameters in the constructor. Libretto-specific configuration can be provided via an additional `libretto` argument (see below).

To allow our tools to separate the "prompt" from the "prompt parameters", use the included `objectTemplate` helper and pass the parameters separately as follows:

```typescript
import { OpenAI, objectTemplate } from "@libretto/openai";

async function main() {
  const openai = new OpenAI({
    apiKey: "<OpenAI API Key>", // defaults to process.env.OPENAI_API_KEY
    libretto: {
      apiKey: "<Libretto API Key>", // defaults to process.env.LIBRETTO_API_KEY
    },
  });

  const completion = await openai.chat.completions.create({
    // Instead of a chat message array, you can pass objectTemplate instead.
    messages: objectTemplate([
      { role: "user", content: "Give a hearty welcome to our new user {name}" },
    ]) as any,
    model: "gpt-3.5-turbo",
    libretto: {
      // Uniquely identifies this prompt within your project.
      promptTemplateName: "ts-client-test-chat",
      // The parameters to fill in the template.
      templateParams: { name: "John" },
      //optional: key/value for passing any additional information for tracing
      metadata: { someKey: "somevalue" },
    },
  });

  console.log(completion.choices);
}

main();
```

### Configuration

The following options may be set in the `libretto` object that has been added to the OpenAI client constructor:

- `promptTemplateName`: A default name to associate with prompts. If provided,
  this is the name that will be associated with any `create` call that's made
  **without** a `libretto.promptTemplateName` parameter.
- `allowUnnamedPrompts`: When set to `true`, every prompt will be sent to
  Libretto even if no prompt template name as been provided (either via the
  `promptTemplateName` option here or via the `libretto.promptTemplateName`
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
- `metadata`: This optional key/value map lets you send additional information
  along with your request such as internal tracing IDs, user IDs etc.

## Sending Feedback

Sometimes the answer provided by the LLM is not ideal, and your users may be
able to help you find better responses. There are a few common cases:

- You might use the LLM to suggest the title of a news article, but let the
  user edit it. If they change the title, you can send feedback to Libretto
  that the answer was not ideal.
- You might provide a chatbot that answers questions, and the user can rate the  
  answers with a thumbs up (good) or thumbs down (bad).

You can send this feedback to Libretto by calling `sendFeedback()`. This will
send feedback about a prompt that was previously called, and let you review
this feedback in the Libretto dashboard. You can use the feedback to develop new
tests and improve your prompts.

```typescript
import crypto from "crypto";
import { OpenAI, sendFeedback } from "@libretto/openai";

async function main() {
  const openai = new OpenAI();

  // Must be unique for each call to OpenAI
  const completion = await openai.chat.completions.create({
    // ...
  });

  // Maybe the user didn't like the answer, so ask them for a better one.
  const betterAnswer = await askUserForBetterResult(completion.choices[0].text);

  // If the user provided a better answer, send feedback to Libretto
  if (betterAnswer !== completion.choices[0].text) {
    // feedback key is automatically injected into OpenAI response object.
    const feedbackKey = completion.libretto?.feedbackKey;
    await sendFeedback({
      apiKey: "<Libretto API Key>", // defaults to process.env.LIBRETTO_API_KEY
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
