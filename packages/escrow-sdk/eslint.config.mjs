import tseslint from "typescript-eslint";

export default tseslint.config(...tseslint.configs.recommended, {
  files: ["src/contract/**/*.ts"],
  rules: {
    // Stellar CLI output is byte-checked against the contract WASM in CI.
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-unsafe-declaration-merging": "off",
  },
});
