import { f, objectTemplate } from "../src";
import { OpenAI } from "../src/client";

async function main() {
  const openai = new OpenAI({
    // apiKey: process.env.OPENAI_API_KEY
  });

  console.log("Testing Chat API...");
  const completion = await openai.chat.completions.create({
    messages: objectTemplate([
      { role: "user", content: "Say this is a test to {name}" },
    ]) as any,
    model: "gpt-3.5-turbo",
    libretto: {
      promptTemplateName: "ts-client-test-chat",
      templateParams: { name: "John" },
    },
  });
  console.log("Chat API replied with: ", completion.choices);

  console.log("Testing Completion API...");
  const completion2P = openai.completions.create({
    prompt: f`Say this is a test to {name}` as unknown as string,
    model: "text-davinci-003",
    libretto: {
      promptTemplateName: "ts-client-test-completion",
      templateParams: { name: "John" },
    },
  });
  console.log("awaiting result...");
  const completion2 = await completion2P;

  console.log("Completion API replied with: ", completion2);
}

main()
  .then(() => {
    console.log("Done.");
  })
  .catch((e) => {
    console.log("error: ", e);
  });
