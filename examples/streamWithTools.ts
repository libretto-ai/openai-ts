import { objectTemplate } from "../src";
import { OpenAI } from "../src/client";

async function main() {
  const openai = new OpenAI({
    // apiKey: process.env.OPENAI_API_KEY
  });

  console.log("Testing Chat API with stream and tools...");
  const completion = await openai.chat.completions.create({
    messages: objectTemplate([
      {
        role: "user",
        content: "What's the weather like in {location}?",
      },
    ]),
    model: "gpt-4o-mini",
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
    stream: true,
    libretto: {
      promptTemplateName: "weather-report",
      templateParams: { location: "Chicago" },
    },
  });

  let idx: number = 0;
  for await (const result of completion) {
    if (!result.choices[0].finish_reason) {
      console.log(
        `Tools chunk ${idx}: ${JSON.stringify(result?.choices?.[0]?.delta?.tool_calls, null, 4)}`,
      );
      idx = idx + 1;
    }
  }
}

main()
  .then(() => {
    console.log("Done.");
  })
  .catch((e) => {
    console.error("error: ", e);
  });
