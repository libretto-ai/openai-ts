export { send_event } from "./client";
export { patch } from "./patch";
export { f, objectTemplate } from "./template";

declare module "openai/resources/chat/completions" {
  interface ChatCompletionCreateParamsBase {
    ip_api_key?: string;
    ip_prompt_template_name?: string;
    ip_template_text?: string;
    ip_template_chat?: any[];
    ip_template_params?: Record<string, any>;
    ip_chat_id?: string;
    ip_parent_event_id?: string;
    ip_only_named_prompts?: boolean;
  }
}

declare module "openai/resources/completions" {
  interface CompletionCreateParamsBase {
    ip_api_key?: string;
    ip_prompt_template_name?: string;
    ip_template_text?: string;
    ip_template_chat?: any[];
    ip_template_params?: Record<string, any>;
    ip_chat_id?: string;
    ip_parent_event_id?: string;
    ip_only_named_prompts?: boolean;
  }
}
