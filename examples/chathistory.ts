import { ChatCompletionMessageParam } from "openai/resources";
import { objectTemplate } from "../src";
import { OpenAI } from "../src/client";

async function main() {
  const openai = new OpenAI({
    // apiKey: process.env.OPENAI_API_KEY
  });

  console.log("Testing Chat API with chat history...");
  const completion = await openai.chat.completions.create({
    messages: objectTemplate([
      {
        role: "system",
        content: `My role is to be the AI Coach Supervisor to help guide the coach. I will receive a question from the coach, and I will guide them on the content and quality of the question.`,
      },
      {
        role: "chat_history",
        content: "{prev_messages} {second_history}",
      },
      {
        role: "user",
        content: "{coach_question}",
      },
    ]) as ChatCompletionMessageParam[], // need to cast because of chat_history
    model: "gpt-4o-mini",
    temperature: 1,
    libretto: {
      promptTemplateName: "AI Supervisor",
      // chat id
      chatId: "c1",
      // The parameters to fill in the template.
      templateParams: {
        prev_messages: [
          {
            role: "user",
            content: "I am not feeling very good because of my home life.",
          },
          {
            role: "assistant",
            content: "I am sorry to hear that.",
          },
        ],
        second_history: [
          {
            role: "user",
            content: "Thank you for the kind words.",
          },
          {
            role: "assistant",
            content: "You're welcome",
          },
        ],
        coach_question:
          "What is the best way to ask a question to an employee who is depressed?",
      },
    },
  });
  console.log("Chat API with chat historyreplied with: ", completion.choices);
}

main()
  .then(() => {
    console.log("Done.");
  })
  .catch((e) => {
    console.log("error: ", e);
  });
