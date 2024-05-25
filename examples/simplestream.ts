import crypto from "crypto";
import { f, objectTemplate } from "../src";
import { Anthropic } from "../src/client";

async function main() {
  const anthropic = new Anthropic({
    // apiKey: process.env.OPENAI_API_KEY
  });

  console.log("Testing Streaming Chat API...");
  const completion = await anthropic.messages.create({
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
  console.log("got completion: ", completion);
  for await (const result of completion) {
    console.log("Streamed Chat API replied with: ", result);
  }
  console.log("Testing Streaming Completion API...");
  const completion2 = await anthropic.completions.create({
    prompt: f`Tell a 20 word story about {name}` as unknown as string,
    model: "davinci",
    stream: true,
    max_tokens_to_sample: 1024,
    libretto: {
      promptTemplateName: "ts-client-test-chat",
      templateParams: { name: "John" },
      feedbackKey: crypto.randomUUID(),
    },
  });
  for await (const result of completion2) {
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
