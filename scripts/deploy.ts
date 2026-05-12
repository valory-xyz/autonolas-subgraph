import * as clack from "@clack/prompts";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

interface DeploymentConfig {
  subgraphName: string;
  manifestFile?: string; // Selected manifest file when multiple exist
  version: string;
}

function getSubgraphDirectories(): string[] {
  const subgraphsDir = join(process.cwd(), "subgraphs");

  if (!existsSync(subgraphsDir)) {
    clack.log.error("Subgraphs directory not found");
    process.exit(1);
  }

  return readdirSync(subgraphsDir)
    .filter((name) => {
      const fullPath = join(subgraphsDir, name);
      const hasPackageJson = existsSync(join(fullPath, "package.json"));
      return statSync(fullPath).isDirectory() && hasPackageJson;
    })
    .sort();
}

function getManifestFiles(subgraphDir: string): string[] {
  const files = readdirSync(subgraphDir);
  const manifestFiles = files.filter(
    (file) =>
      file.startsWith("subgraph.") &&
      file.endsWith(".yaml") &&
      file !== "subgraph.yaml" &&
      !file.includes("template"),
  );

  // If there's a direct subgraph.yaml, prioritize it
  if (existsSync(join(subgraphDir, "subgraph.yaml"))) {
    return ["subgraph.yaml"];
  }

  return manifestFiles.sort();
}

async function promptForManifest(
  subgraphDir: string,
): Promise<string | undefined> {
  const manifestFiles = getManifestFiles(subgraphDir);

  if (manifestFiles.length === 0) {
    clack.log.error("No subgraph manifest files found");
    process.exit(1);
  }

  if (manifestFiles.length === 1) {
    clack.log.info(`📄 Using manifest file: ${manifestFiles[0]}`);
    return manifestFiles[0];
  }

  // Multiple manifest files found, ask user to select
  clack.log.info(
    `📄 Found ${manifestFiles.length} manifest files: ${manifestFiles.join(
      ", ",
    )}`,
  );
  const selectedManifest = (await clack.select({
    message: "Multiple manifest files found. Select which one to deploy:",
    options: manifestFiles.map((file) => ({
      value: file,
      label: `📄 ${file}`,
    })),
  })) as string;

  if (clack.isCancel(selectedManifest)) {
    clack.cancel("Operation cancelled");
    process.exit(0);
  }

  return selectedManifest;
}

function isSemver(input: string) {
  // Must start with "v" and follow semver rules: vMAJOR.MINOR.PATCH[-prerelease][+build]
  return /^v(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(
    input,
  );
}

async function promptForConfiguration(): Promise<DeploymentConfig> {
  const subgraphDirectories = getSubgraphDirectories();

  if (subgraphDirectories.length === 0) {
    clack.log.error("No subgraph directories found with package.json");
    process.exit(1);
  }

  const subgraphName = (await clack.select({
    message: "Select subgraph to deploy:",
    options: subgraphDirectories.map((name) => ({
      value: name,
      label: `📦 ${name}`,
    })),
  })) as string;

  if (clack.isCancel(subgraphName)) {
    clack.cancel("Operation cancelled");
    process.exit(0);
  }

  // Check for multiple manifest files and prompt for selection
  const subgraphDir = join(process.cwd(), "subgraphs", subgraphName);
  const manifestFile = await promptForManifest(subgraphDir);

  const version = (await clack.text({
    message: "Version:",
    placeholder: "v1.2.3",
    validate: (value) => {
      if (!isSemver(value)) {
        return "❌ Must be a valid semantic version (e.g. 1.2.3)";
      }
    },
  })) as string;

  if (clack.isCancel(version)) {
    clack.cancel("Operation cancelled");
    process.exit(0);
  }

  clack.log.info("📋 Deployment Summary:");
  clack.log.info(`   Subgraph: ${subgraphName}`);
  clack.log.info(`   Version: ${version}`);
  clack.log.info(`   Manifest: ${manifestFile}`);

  return {
    subgraphName,
    manifestFile,
    version,
  };
}

async function deploySubgraph(config: DeploymentConfig) {
  const { subgraphName, manifestFile, version } = config;

  const command = `gh workflow run deploy-subgraph.yaml \\
  --ref main \\
  -f environment=production \\
  -f subgraph=${subgraphName} \\
  -f version=${version} \\
  -f manifest=${manifestFile}`;

  clack.outro(`🚀 Run this command to deploy the subgraph:\n\n${command}`);
}

async function main() {
  const config = await promptForConfiguration();

  await deploySubgraph(config);
}

main().catch(console.error);
