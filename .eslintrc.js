/* eslint-env node */
module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  root: true,
  ignorePatterns: ["lib", "node_modules", "jest.config.js"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
  },
  env: {
    jest: true,
  },
};
