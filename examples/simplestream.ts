import crypto from "crypto";
import { f, objectTemplate } from "../src";
import { Anthropic } from "../src/client";

async function main() {
  const anthropic = new Anthropic({
    // apiKey: process.env.ANTHROPIC_API_KEY
  });

  console.log("Testing Streaming Chat API...");
  const messages = await anthropic.messages.create({
    messages: objectTemplate([
      { role: "user", content: "Tell a 20 word story about {name}" },
    ]) as any,
    model: "claude-3-haiku-20240307",
    max_tokens: 1024,
    stream: true,
    libretto: {
      promptTemplateName: "ts-client-test-chat",
      templateParams: { name: "John" },
      feedbackKey: crypto.randomUUID(),
    },
  });
  console.log("got completion: ", messages);
  for await (const message of messages) {
    console.log("Streamed Chat API replied with: ", message);
  }
  console.log("Testing Streaming Completion API...");
  const completion = await anthropic.completions.create({
    prompt:
      f`\n\nHuman: Tell a 20 word story about {name}\n\n Assistant:` as unknown as string,
    model: "claude-2.1",
    stream: true,
    max_tokens_to_sample: 1024,
    libretto: {
      promptTemplateName: "ts-client-test-chat",
      templateParams: { name: "John" },
      feedbackKey: crypto.randomUUID(),
    },
  });
  for await (const result of completion) {
    console.log("Streamed Completion API replied with: ", result);
  }
}

main()
  .then(() => {
    console.log("Done.");
  })
  .catch((e) => {
    console.log("error: ", e);
  });
