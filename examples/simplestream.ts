import { faker } from "@faker-js/faker";
import crypto from "crypto";
import { f, objectTemplate } from "../src";
import { OpenAI } from "../src/client";

async function testStreamingChatAPI() {
  const openai = new OpenAI({
    // apiKey: process.env.OPENAI_API_KEY
  });
  let finalResponse = "";

  console.log("Testing Streaming Chat API...");
  const completion = await openai.chat.completions.create({
    messages: objectTemplate([
      { role: "user", content: "Tell a 20 word story about {name}" },
    ]),
    model: "gpt-4o-mini",
    stream: true,
    libretto: {
      promptTemplateName: "ts-client-test-chat-2",
      templateParams: { name: faker.person.firstName() },
      feedbackKey: crypto.randomUUID(),
    },
  });
  for await (const result of completion) {
    console.log("Streamed Chat API replied with: ", result.choices);
    if (!result.choices[0].finish_reason) {
      finalResponse += result.choices[0].delta.content;
    }
  }
  console.log("Final response: ", finalResponse);
}

async function testStreamingCompletionAPI() {
  const openai = new OpenAI({
    // apiKey: process.env.OPENAI_API_KEY
  });

  console.log("Testing Streaming Completion API...");
  const completion = await openai.completions.create({
    prompt: f`Tell a 20 word story about {name}` as unknown as string,
    model: "gpt-3.5-turbo-instruct",
    stream: true,
    libretto: {
      promptTemplateName: "ts-client-test-completion",
      templateParams: { name: faker.person.firstName() },
      feedbackKey: crypto.randomUUID(),
    },
  });
  for await (const result of completion) {
    console.log("Streamed Completion API replied with: ", result);
  }
}

async function main() {
  // Show help message if --help flag is passed
  if (process.argv.includes("--help")) {
    console.log(`Usage: ${process.argv[0]} ${process.argv[1]} [options]`);
    console.log("");
    console.log("Options:");
    console.log("  --help    Show this help message");
    console.log("  --legacy  Run legacy completion API test");
    console.log("  --repeat  Repeat the API calls a specified number of times");
    return;
  }

  // Determine the number of repetitions
  const repeatIndex = process.argv.indexOf("--repeat");
  const repeatCount =
    repeatIndex !== -1 ? parseInt(process.argv[repeatIndex + 1], 10) : 1;

  for (let i = 0; i < repeatCount; i++) {
    await testStreamingChatAPI();

    // Only run legacy completion API if --legacy flag is passed
    if (process.argv.includes("--legacy")) {
      await testStreamingCompletionAPI();
    }
  }
}

main()
  .then(() => {
    console.log("Done.");
  })
  .catch((e) => {
    console.log("error: ", e);
  });
