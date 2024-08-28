import { SyncRedactor } from "@libretto/redact-pii-light";

export class PiiRedactor {
  protected redactor: SyncRedactor;

  constructor() {
    this.redactor = new SyncRedactor({
      builtInRedactors: {
        digits: {
          enabled: false,
        },
      },
    });
  }

  redactText(text: string) {
    return this.redactor.redact(text);
  }

  redact(val: any): any {
    if (val === undefined || val === null) {
      return val;
    }
    if (Array.isArray(val)) {
      return val.map((el) => this.redact(el));
    }
    if (typeof val === "object") {
      return Object.fromEntries(
        Object.entries(val).map(([k, v]) => [k, this.redact(v)]),
      );
    }
    if (typeof val === "string") {
      return this.redactText(val);
    }
    return this.redactText(new String(val).valueOf());
  }
}
