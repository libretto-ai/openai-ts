import { OpenAI } from "../src/client";
import { objectTemplate } from "../src";

async function main() {
  const openai = new OpenAI({
    // apiKey: process.env.OPENAI_API_KEY
  });

  console.log("Testing Chat API...");
  const completion = await openai.chat.completions.create({
    messages: objectTemplate([
      {
        role: "user",
        content: "What's the weather like in {location}?",
      },
    ]) as any,
    model: "gpt-3.5-turbo",
    tools: [
      {
        type: "function",
        function: {
          name: "get_current_weather",
          description: "Get the current weather in a given location",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "The city and state, e.g. San Francisco, CA",
              },
              unit: { type: "string", enum: ["celsius", "fahrenheit"] },
            },
            required: ["location"],
          },
        },
      },
    ],
    libretto: {
      promptTemplateName: "weather-report",
      templateParams: { location: "Chicago" },
    },
  });
  console.log(
    "Chat API replied with: ",
    JSON.stringify(completion.choices, null, 4),
  );
}

main()
  .then(() => {
    console.log("Done.");
  })
  .catch((e) => {
    console.error("error: ", e);
  });
