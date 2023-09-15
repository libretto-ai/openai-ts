import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions";
export * from "./client";
export * from "./patch";
export * from "./template";

declare module "openai/resources/chat/completions" {
  interface ChatCompletionCreateParamsBase {
    ip_api_key?: string;
    ip_prompt_template_name?: string;
    ip_template_text?: string;
    ip_template_chat?: any[];
    ip_template_params?: Record<string, any>;
    ip_chat_id?: string;
    ip_parent_event_id?: string;
  }
}
