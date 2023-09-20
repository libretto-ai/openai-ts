import crypto from "crypto";
import OpenAI from "openai";
import { f, objectTemplate } from "../src";
import { patch } from "../src/patch";

async function main() {
  patch();
  const openai = new OpenAI({
    // apiKey: process.env.OPENAI_API_KEY
  });

  console.log("Testing Streaming Chat API...");
  const completion = await openai.chat.completions.create({
    messages: objectTemplate([
      { role: "user", content: "Tell a 20 word story about {name}" },
    ]) as any,
    model: "gpt-3.5-turbo",
    stream: true,
    ip_api_key: "619dd081-2f72-4eb1-9f90-3d3c3772334d",
    ip_prompt_template_name: "ts-client-test-chat",
    ip_template_params: { name: "John" },
    ip_feedback_key: crypto.randomUUID(),
  });
  for await (const result of completion) {
    console.log("Streamed Chat API replied with: ", result.choices);
  }
  console.log("Testing Streaming Completion API...");
  const completion2 = await openai.completions.create({
    prompt: f`Tell a 20 word story about {name}` as unknown as string,
    model: "davinci",
    stream: true,
    ip_api_key: "619dd081-2f72-4eb1-9f90-3d3c3772334d",
    ip_prompt_template_name: "ts-client-test-chat",
    ip_template_params: { name: "John" },
    ip_feedback_key: crypto.randomUUID(),
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
