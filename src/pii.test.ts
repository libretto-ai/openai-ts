import { PiiRedactor } from "./pii";

describe("PiiRedactor", () => {
  const r = new PiiRedactor();

  describe("redacts text that contains", () => {
    it.each([
      ["Hi Bob", "Hi PERSON_NAME"],
      ["Hi Justin", "Hi PERSON_NAME"],
    ])("people's names", (input, expected) => {
      expect(r.redact(input)).toEqual(expected);
    });

    it.each([
      ["my VISA card: 4012888888881881.", "my VISA card: CREDIT_CARD_NUMBER."],
      [
        "my MASTERCARD card: 5105105105105100.",
        "my MASTERCARD card: CREDIT_CARD_NUMBER.",
      ],
      [
        "my DISCOVER card: 6011111111111117.",
        "my DISCOVER card: CREDIT_CARD_NUMBER.",
      ],
      ["my AMEX card: 3782 822463 10005.", "my AMEX card: CREDIT_CARD_NUMBER."],
    ])("credit card numbers", (input, expected) => {
      expect(r.redact(input)).toEqual(expected);
    });

    it.each([
      ["my ssn: 321 45 6789.", "my ssn: US_SOCIAL_SECURITY_NUMBER."],
      ["my ssn: 321-45-6789.", "my ssn: US_SOCIAL_SECURITY_NUMBER."],
      ["my ssn: 321.45.6789.", "my ssn: US_SOCIAL_SECURITY_NUMBER."],
    ])("social security numbers", (input, expected) => {
      expect(r.redact(input)).toEqual(expected);
    });

    it.each([
      ["my phone: (+44) (555)123-1234.", "my phone: PHONE_NUMBER."],
      ["my phone: 1-510-748-8230.", "my phone: PHONE_NUMBER."],
      ["my phone: 510.748.8230.", "my phone: PHONE_NUMBER."],
      ["my phone: 5107488230.", "my phone: PHONE_NUMBER."],
    ])("phone numbers", (input, expected) => {
      expect(r.redact(input)).toEqual(expected);
    });

    it.each([
      ["my ip: 10.1.1.235.", "my ip: IP_ADDRESS."],
      [
        "my ip: 1234:ABCD:23AF:1111:2222:3333:0000:0000:0000.",
        "my ip: IP_ADDRESS.",
      ],
    ])("ip addresses", (input, expected) => {
      expect(r.redact(input)).toEqual(expected);
    });

    it.each([
      ["my email: joe123@solvvy.co.uk.", "my email: EMAIL_ADDRESS."],
      ["my email is other+foobar@t.co.", "my email is EMAIL_ADDRESS."],
    ])("email addresses", (input, expected) => {
      expect(r.redact(input)).toEqual(expected);
    });

    it.each([
      [
        "Please visit http://www.example.com/foo/bar?foo=bar to continue.",
        "Please visit URL to continue.",
      ],
    ])("urls", (input, expected) => {
      expect(r.redact(input)).toEqual(expected);
    });

    it.each([
      [
        "I live at 123 Park Ave Apt 123 New York City, NY 10002",
        "I live at STREET_ADDRESS New York City, NY ZIPCODE",
      ],
      [
        "my address is 56 N First St NY 90210",
        "my address is STREET_ADDRESS NY ZIPCODE",
      ],
    ])("street addresses", (input, expected) => {
      expect(r.redact(input)).toEqual(expected);
    });
  });

  describe("handles input of type", () => {
    it("string", () => {
      expect(r.redact("Hello Alice")).toEqual("Hello PERSON_NAME");
    });

    it("array", () => {
      expect(r.redact(["Hello Alice", "Hello Tom"])).toEqual([
        "Hello PERSON_NAME",
        "Hello PERSON_NAME",
      ]);
    });

    it("object", () => {
      expect(
        r.redact({
          foo: "Hello Alice",
          bar: "Hey Tom",
        }),
      ).toEqual({
        foo: "Hello PERSON_NAME",
        bar: "Hey PERSON_NAME",
      });
    });

    it("number", () => {
      expect(r.redact(90210)).toEqual("ZIPCODE");
    });
  });
});
