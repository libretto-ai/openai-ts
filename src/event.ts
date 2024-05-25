import Anthropic from "@anthropic-ai/sdk";

export interface AnthropicExtraParams {
  apiKey?: string;
  promptTemplateName?: string;
  allowUnnamedPrompts?: boolean;
  redactPii?: boolean;
  templateText?: string;
  templateChat?: any[];
  templateParams?: Record<string, any>;
  chatId?: string;
  parentEventId?: string;
  Anthropic?: typeof Anthropic;
}
