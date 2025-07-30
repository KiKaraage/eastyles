declare module "daisyui";

declare const browser: typeof globalThis.browser;
declare module "*.svg" {
  const content: string;
  export default content;
}
