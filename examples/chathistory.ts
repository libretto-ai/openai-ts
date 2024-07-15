import { objectTemplate } from "../src";
import { Anthropic } from "../src/client";

async function main() {
  const anthropic = new Anthropic({
    // apiKey: process.env.ANTHROPIC_API_KEY
  });

  console.log("Testing Chat API with chat history...");
  const completion = await anthropic.messages.create({
    system: `My role is to be the AI Coach Supervisor to help guide the coach. 
    I will receive a question from the coach, and I will guide them on the content 
    and quality of the question.`,
    messages: objectTemplate([
      {
        role: "chat_history",
        content: "{prev_messages} {second_history}",
      },
      {
        role: "user",
        content: "{coach_question}",
      },
    ]) as any, // need to cast because of role: "chat_history"
    model: "claude-3-haiku-20240307",
    max_tokens: 1024,
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
  console.log("Chat API with chat historyreplied with: ", completion);
}

main()
  .then(() => {
    console.log("Done.");
  })
  .catch((e) => {
    console.log("error: ", e);
  });
