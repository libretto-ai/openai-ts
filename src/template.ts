// we only support the simplest of template expressions
const templateExpression = /({[a-zA-Z0-9_[\].]+})/g;
const templateExpressionVarName = /{([a-zA-Z0-9_[\].]+)}/g;
// We have a special keyword that we use to expand out an array for a chat_history argument
const CHAT_HISTORY = "chat_history";
const CHAT_HISTORY_VARIABLE = "{chat_history}";
const ROLE_KEY = "role";
const CONTENT_KEY = "content";

/**
 * An alternative to template literals that allows for capturing the name of the
 * variables involved, and doing variable substitution at a later time.
 *
 * This is used for prompts where you want the same prompt but swap out certain values.
 *
 * Example:
 *
 * ```
 * const template = f`Hello {name}!`;
 *
 * // exposes the following:
 * template.variables; // ["name"]
 * template.format({name: "World"}); // "Hello World!"
 * template.template; // "Hello {name}!"
 * ```
 *
 *
 * @param strings The string parts passed to the template literal
 * @returns An object with the following properties:
 * - `variables`: The names of the variables used in the template
 * - `format`: A function that takes a dictionary of variable names to values, and returns the formatted string
 * - `template`: The original template string
 * @throws If the template literal contains any inline variables (e.g. `${name}` instead of `{name}`)
 */
export function f(
  strings: TemplateStringsArray | string,
  ...inlineVariables: any[]
) {
  if (inlineVariables.length > 0) {
    throw new Error("No inline variables: Use {} syntax, instead of ${}");
  }
  const strArray = typeof strings == "string" ? [strings] : strings;
  const str = strArray.join("");

  const variables = Array.from(
    new Set(
      str
        .split(templateExpression)
        .map(
          (s) =>
            // extract the variable name from the template expression
            templateExpressionVarName.exec(s)?.[1],
        )
        .filter((s): s is string => !!s),
    ),
  );
  return {
    format(parameters: Record<string, any>) {
      return str.replace(templateExpressionVarName, (match, variableName) => {
        return parameters[variableName];
      });
    },
    variables: Object.freeze(variables),
    template: str,
  };
}

/**
 * A template for nested objects, most useful when constructing chat prompts.
 */
export interface ObjectTemplate<T> {
  /**
   * A function that takes a dictionary of variable names to values, and returns the formatted object
   */
  format(parameters: Record<string, any>): T;
  /**
   * The names of the variables used in the template
   */
  variables: readonly string[];
  /**
   * The original template object
   */
  template: T;
}

/**
 * A template for nested objects, most useful when constructing chat prompts.
 *
 * Example:
 *
 * ```
 * const template = objectTemplate([{
 *   "role": "user",
 *   "content": f`Hello {name}!`
 * }]);
 *
 * // exposes the following:
 * template.variables; // ["name"]
 * template.format({name: "World"}); // [{role: "user", content: "Hello World!"}]
 * template.template; // [{role: "user", content: "Hello {name}!"}]
 * ```
 *
 * @param objs The object to template
 * @returns An object with the following properties:
 * - `variables`: The names of the variables used in the template
 * - `format`: A function that takes a dictionary of variable names to values, and returns the formatted object
 * - `template`: The original template object
 * @throws If the template literal contains any inline variables (e.g. `${name}` instead of `{name}`)
 */
export function objectTemplate<T>(objs: T): ObjectTemplate<T> {
  const variables = objTemplateVariables(objs);

  function format(parameters: Record<string, any>): T {
    if (objs === undefined || objs === null || typeof objs == "number") {
      return objs;
    }
    if (typeof objs == "string") {
      return f(objs).format(parameters) as T;
    }
    if (Array.isArray(objs)) {
      return objs.flatMap((item) => {
        // We have special handling for chat history, as we need to expand out
        // the given variable
        if (isLibrettoChatHistory(item)) {
          return handleChatHistory(parameters[CHAT_HISTORY]);
        }

        return objectTemplate(item).format(parameters);
      }) as T;
    }

    return Object.fromEntries(
      Object.entries(objs).map(([key, value]) => {
        return [
          f(key).format(parameters),
          objectTemplate(value).format(parameters),
        ];
      }),
    ) as T;
  }
  return {
    format,
    variables: Object.freeze(variables),
    template: objs,
  };
}

function objTemplateVariables(objs: any): readonly string[] {
  if (objs === undefined || objs === null || typeof objs == "number") {
    return [];
  }
  if (typeof objs == "string") {
    return f(objs).variables;
  }

  if (Array.isArray(objs)) {
    return objs.flatMap((item) => objTemplateVariables(item));
  }
  return Object.entries(objs).flatMap(([, value]): readonly string[] => {
    if (typeof value == "string") {
      return f(value).variables;
    }
    return objTemplateVariables(value);
  });
}

/**
 * Determines if this has a Libretto Chat History defined object.
 * It follows an expected/exact setup where the role is chat_history and the
 * content is just the chat_history variable.
 * @param obj
 * @returns true if it's the Libretto chat history setup
 */
function isLibrettoChatHistory(objs: any): boolean {
  if (objs === undefined || objs === null || typeof objs == "number") {
    return false;
  }
  if (typeof objs == "string") {
    return false;
  }

  if (Array.isArray(objs)) {
    return false;
  }

  // An object, check role and content for chat_history
  if (ROLE_KEY in objs && CONTENT_KEY in objs) {
    return (
      objs[ROLE_KEY] === CHAT_HISTORY &&
      objs[CONTENT_KEY] === CHAT_HISTORY_VARIABLE
    );
  }

  return false;
}

function handleChatHistory(chatHistoryParamValues: any): any[] {
  // Validate we have expected parameters for chat_history
  if (!chatHistoryParamValues || !Array.isArray(chatHistoryParamValues)) {
    throw new Error(
      `The Template expects there to be an array for the 'chat_history' parameter, but none was found or it was not an array. Ensure 'chat_history' is a parameter in the templateParams and that it is an array.`,
    );
  }

  // Loop through the chat_history parameters, and expand as regular chat messages
  return [...chatHistoryParamValues];
}
