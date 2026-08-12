import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { rebuildCampusBusPredictionModel } =
    await import("../src/lib/campus-transport/prediction-model-store");
  const result = await rebuildCampusBusPredictionModel();
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
