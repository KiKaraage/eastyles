import { access, copyFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = process.cwd();

const nestedDir = resolve(
  projectRoot,
  "node_modules/@wxt-dev/i18n/node_modules/wxt/dist",
);

const nestedModulesJs = resolve(nestedDir, "modules.js");
const nestedModulesDts = resolve(nestedDir, "modules.d.ts");
const nestedModulesDcts = resolve(nestedDir, "modules.d.cts");

const rootModulesMjs = resolve(
  projectRoot,
  "node_modules/wxt/dist/modules.mjs",
);
const rootModulesDts = resolve(
  projectRoot,
  "node_modules/wxt/dist/modules.d.ts",
);
const rootModulesDcts = resolve(
  projectRoot,
  "node_modules/wxt/dist/modules.d.cts",
);

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

if ((await pathExists(nestedModulesJs)) && (await pathExists(rootModulesMjs))) {
  const shim = `export * from "../../../../../wxt/dist/modules.mjs";
export { addAlias } from "../../../../../wxt/dist/modules.mjs";
`;

  await writeFile(nestedModulesJs, shim, "utf8");

  if (
    (await pathExists(rootModulesDts)) &&
    (await pathExists(nestedModulesDts))
  ) {
    await copyFile(rootModulesDts, nestedModulesDts);
  }

  if (
    (await pathExists(rootModulesDcts)) &&
    (await pathExists(nestedModulesDcts))
  ) {
    await copyFile(rootModulesDcts, nestedModulesDcts);
  }
}
