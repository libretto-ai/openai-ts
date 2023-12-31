import { f, objectTemplate } from "./template";

describe("templating", () => {
  describe("f", () => {
    it("should extract variables", () => {
      expect(f`{a} {b} {c}`.variables).toEqual(["a", "b", "c"]);
    });

    it("Should throw an error when using variables in a template string", () => {
      const a = "a";
      const b = "b";
      const c = "c";
      expect(() => f`${a} ${b} ${c}`.variables).toThrowError(
        "No inline variables",
      );
    });

    it("Should format to a string", () => {
      expect(f`{a} {b} {c}`.format({ a: "A", b: "B", c: "C" })).toEqual(
        "A B C",
      );
    });
  });

  describe("objTemplate", () => {
    it("should extract variables from objects", () => {
      expect(
        objectTemplate({ a: "A here: {a}", b: "B here: {b}" }).variables,
      ).toEqual(["a", "b"]);
    });

    it("should extract variables from nested objects", () => {
      expect(
        objectTemplate({
          a: "A here: {a}",
          b: "B here: {b}",
          c: { d: "D here: {d}", e: "E here: {e}" },
        }).variables,
      ).toEqual(["a", "b", "d", "e"]);
    });

    it("should extract variables from arrays", () => {
      expect(objectTemplate(["A here: {a}", "B here: {b}"]).variables).toEqual([
        "a",
        "b",
      ]);
    });

    it("Should handle nulls, undefined, and numbers in variable extraction", () => {
      expect(
        objectTemplate({
          a: "A here: {a}",
          b: "B here: {b}",
          c: { d: "D here: {d}", e: "E here: {e}" },
          f: null,
          g: undefined,
          h: 1,
        }).variables,
      ).toEqual(["a", "b", "d", "e"]);
    });

    it("Should format a chat template", () => {
      expect(
        objectTemplate([
          {
            role: "system",
            content:
              "You will be asked for travel recomendations by a {role}. Answer as you were a travel guide and give no more than {quantity} recommendation options per answer. Just answer with the options and don't give any introduction. Use markdown to format your response.",
          },
          {
            role: "user",
            content: "Where can I eat {food} in {city}?",
          },
        ]).format({
          role: "tourist",
          quantity: 3,
          food: "pizza",
          city: "Rome",
        }),
      ).toEqual([
        {
          role: "system",
          content:
            "You will be asked for travel recomendations by a tourist. Answer as you were a travel guide and give no more than 3 recommendation options per answer. Just answer with the options and don't give any introduction. Use markdown to format your response.",
        },
        {
          role: "user",
          content: "Where can I eat pizza in Rome?",
        },
      ]);
    });
  });
});
