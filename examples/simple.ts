import { f, objectTemplate } from "../src";
import { Anthropic } from "../src/client";

async function main() {
  const anthropic = new Anthropic({
    // apiKey: process.env.ANTHROPIC_API_KEY
  });

  console.log("Testing Chat API...");
  const messages = await anthropic.messages.create({
    messages: objectTemplate([
      { role: "user", content: "Say this is a test to {name}" },
    ]) as any,
    max_tokens: 1024,
    model: "claude-3-haiku-20240307",
    libretto: {
      promptTemplateName: "ts-client-test-chat",
      templateParams: { name: "John" },
    },
  });
  console.log("Chat API replied with: ", messages.content);

  console.log("Testing Completion API...");
  const completion = await anthropic.completions.create({
    prompt:
      f`\n\nHuman: Say this is a test to {name}\n\nAssistant:` as unknown as string,
    model: "claude-2.1",
    max_tokens_to_sample: 1024,
    libretto: {
      promptTemplateName: "ts-client-test-completion",
      templateParams: { name: "John" },
    },
  });

  console.log("Completion API replied with: ", completion);
}

main()
  .then(() => {
    console.log("Done.");
  })
  .catch((e) => {
    console.log("error: ", e);
  });
