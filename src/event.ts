export interface OpenAIExtraParams {
  apiKey?: string;
  promptTemplateName?: string;
  templateText?: string;
  templateChat?: any[];
  templateParams?: Record<string, any>;
  chatId?: string;
  parentEventId?: string;
}
