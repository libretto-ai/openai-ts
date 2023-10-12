import OpenAI from "openai";

export interface OpenAIExtraParams {
  apiKey?: string;
  promptTemplateName?: string;
  allowUnnamedPrompts?: boolean;
  templateText?: string;
  templateChat?: any[];
  templateParams?: Record<string, any>;
  chatId?: string;
  parentEventId?: string;
  OpenAI?: typeof OpenAI;
}
