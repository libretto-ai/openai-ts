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
        content: "{chat_history}",
      },
      {
        role: "user",
        content: "{coach_question}",
      },
    ]) as any,
    model: "gpt-3.5-turbo",
    temperature: 1,
    libretto: {
      promptTemplateName: "AI Supervisor",
      // chat id
      chatId: "c1",
      // The parameters to fill in the template.
      templateParams: {
        chat_history: [
          {
            role: "user",
            content: "I am not feeling very good because of my home life.",
          },
          {
            role: "assistant",
            content: "I am sorry to hear that.",
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
