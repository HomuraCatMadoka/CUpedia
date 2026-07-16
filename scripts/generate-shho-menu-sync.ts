import { writeFile } from "node:fs/promises";
import { buildShhoMenuSyncPayload } from "../src/lib/canteen-aigens-menu";

const ENDPOINT =
  "https://aigensstoreapp.appspot.com/api/v1/menu/store/102830.json?locale=default&open=true&menu=prekiosk&groupId=1000&country=hk";

async function main() {
  const response = await fetch(ENDPOINT);
  if (!response.ok)
    throw new Error(`Aigens menu request failed: ${response.status}`);
  const payload = buildShhoMenuSyncPayload(await response.json());
  const jsonPayload = {
    source: payload.source,
    takeOverLegacyItems: payload.takeOverLegacyItems,
    items: payload.items.map(({ priceOptions, ...item }) => ({
      ...item,
      pricing: { options: priceOptions },
    })),
  };
  const json = `${JSON.stringify(jsonPayload, null, 2)}\n`;
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex === -1) {
    process.stdout.write(json);
    return;
  }
  const output = process.argv[outputIndex + 1];
  if (!output) throw new Error("--output requires a path");
  await writeFile(output, json, "utf8");
  process.stdout.write(`Wrote ${payload.items.length} items to ${output}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
