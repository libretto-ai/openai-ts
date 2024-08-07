import { objectTemplate } from "../src";
import { OpenAI } from "../src/client";

async function main() {
  const openai = new OpenAI({
    // apiKey: process.env.OPENAI_API_KEY
  });

  console.log("Testing Chat API...");
  const completion = await openai.chat.completions.create({
    messages: objectTemplate([
      {
        role: "system",
        content:
          "I am a super cheerful AI and I respond accordingly to someone's name.",
      },
      { role: "user", content: "This is my name: {name}" },
    ]),
    model: "gpt-4o-mini",
    libretto: {
      promptTemplateName: "ts-client-test-chat",
      templateParams: { name: "John" },
    },
  });
  console.log("Chat API replied with: ", completion.choices);

  console.log("Testing Chat API with array user...");
  const completion2 = await openai.chat.completions.create({
    messages: objectTemplate([
      {
        role: "system",
        content:
          'You are an assistant that names large language model prompts. You look at a first version of a prompt that can be edited in the future. Name the new prompt based on its content. You express the summary concisely, hopefully using just a few words. You will use title casing for the words in your response. You will respond in a JSON format, and the key will always be named the following: "name".',
      },
      {
        role: "user",
        content: [
          {
            text: 'new Prompt:\n=====\n{newPrompt}\n=====\nCreate a name for the new prompt in 5 or fewer words that will summarize the prompt. Respond in a JSON Format using "name" as the key.',
            type: "text",
          },
        ],
      },
    ]),
    model: "gpt-4o-mini",
    response_format: {
      type: "json_object",
    },
    libretto: {
      promptTemplateName: "ts-client-test-user-content-array",
      templateParams: { newPrompt: "This is prompt A" },
    },
  });
  console.log("Chat API replied with: ", completion2.choices);

  // DEPRECATED MODEL, and DEPRECATED API
  // console.log("Testing Completion API...");
  // const completion2P = openai.completions.create({
  //   prompt: f`Say this is a test to {name}` as unknown as string,
  //   model: "text-davinci-003",
  //   libretto: {
  //     promptTemplateName: "ts-client-test-completion",
  //     templateParams: { name: "John" },
  //   },
  // });
  // console.log("awaiting result...");
  // const completion2 = await completion2P;

  // console.log("Completion API replied with: ", completion2);
}

main()
  .then(() => {
    console.log("Done.");
  })
  .catch((e) => {
    console.log("error: ", e);
  });
