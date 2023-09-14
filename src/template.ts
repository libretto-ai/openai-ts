// we only support the simplest of template expressions
const templateExpression = /({[a-zA-Z0-9_[\].]+})/g;
const templateExpressionVarName = /{([a-zA-Z0-9_[\].]+)}/g;

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
            templateExpressionVarName.exec(s)?.[1]
        )
        .filter((s): s is string => !!s)
    )
  );
  return {
    format(parameters: Record<string, any>) {
      return str.replace(templateExpressionVarName, (match, variableName) => {
        return parameters[variableName];
      });
    },
    variables: Object.freeze(variables),
  };
}

interface ObjectTemplate<T> {
  format(parameters: Record<string, any>): T;
  variables: readonly string[];
}

export function objTemplate<T extends any>(objs: T): ObjectTemplate<T> {
  const variables = objTemplateVariables(objs);

  function format(parameters: Record<string, any>): T {
    if (objs === undefined || objs === null || typeof objs == "number") {
      return objs;
    }
    if (typeof objs == "string") {
      return f(objs).format(parameters) as T;
    }
    if (Array.isArray(objs)) {
      return objs.map((item) => objTemplate(item).format(parameters)) as T;
    }

    return Object.fromEntries(
      Object.entries(objs).map(([key, value]) => {
        return [
          f(key).format(parameters),
          objTemplate(value).format(parameters),
        ];
      })
    ) as T;
  }
  return {
    format,
    variables: Object.freeze(variables),
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
  return Object.entries(objs).flatMap(([key, value]): readonly string[] => {
    if (typeof value == "string") {
      return f(value).variables;
    }
    return objTemplateVariables(value);
  });
}
