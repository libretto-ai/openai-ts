import { objectTemplate } from "../src";
import { patch } from "../src/patch";

import OpenAI from "openai";

async function main() {
  patch();
  const openai = new OpenAI({
    // apiKey: process.env.OPENAI_API_KEY
  });

  const completion = await openai.chat.completions.create({
    messages: objectTemplate([
      { role: "user", content: "Say this is a test to {name}" },
    ]) as any,
    model: "gpt-3.5-turbo",
    ip_api_key: "619dd081-2f72-4eb1-9f90-3d3c3772334d",
    ip_prompt_template_name: "ts-client-test-chat",
    ip_template_params: { name: "John" },
  });
  console.log(completion.choices);
}

main();
