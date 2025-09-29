import { exec as execAsync } from "child_process";
import { promisify } from "util";

const exec = promisify(execAsync);
import * as clack from "@clack/prompts";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { existsSync, readdirSync, statSync, unlinkSync, copyFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

interface DeploymentConfig {
  environment: "staging" | "production";
  subgraphName: string;
  finalSubgraphName: string;
  action: "update" | "overwrite";
  dryRun: boolean;
  manifestFile?: string; // Selected manifest file when multiple exist
}

const EnvironmentSchema = z.object({
  BASIC_AUTH_USER: z.string().min(1, "BASIC_AUTH_USER is required"),
  BASIC_AUTH_PASSWORD: z.string().min(1, "BASIC_AUTH_PASSWORD is required"),
  IPFS_REGISTRY: z.string().default("https://registry.autonolas.tech"),
});

type EnvironmentVars = z.infer<typeof EnvironmentSchema>;

const ENVIRONMENT_URLS = {
  staging: {
    node: "admin.subgraph.staging.autonolas.tech"
  },
  production: {
    node: "admin.subgraph.autonolas.tech"
  }
};

async function validateEnvironmentVariables(): Promise<EnvironmentVars> {
  const envData = {
    BASIC_AUTH_USER: process.env.BASIC_AUTH_USER,
    BASIC_AUTH_PASSWORD: process.env.BASIC_AUTH_PASSWORD,
    IPFS_REGISTRY: process.env.IPFS_REGISTRY || "https://registry.autonolas.tech",
  };

  const result = EnvironmentSchema.safeParse(envData);
  if (!result.success) {
    clack.log.error("Environment validation failed");
    clack.log.error(result.error.message);
    process.exit(1);
  }

  const validatedEnvData = result.data;
  return validatedEnvData;
}

function getSubgraphDirectories(): string[] {
  const subgraphsDir = join(process.cwd(), "subgraphs");

  if (!existsSync(subgraphsDir)) {
    clack.log.error("Subgraphs directory not found");
    process.exit(1);
  }

  return readdirSync(subgraphsDir)
    .filter(name => {
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
      !file.includes("template")
  );

  // If there's a direct subgraph.yaml, prioritize it
  if (existsSync(join(subgraphDir, 'subgraph.yaml'))) {
    return ['subgraph.yaml'];
  }

  return manifestFiles.sort();
}

function getChainFromManifest(manifestFile: string): string | null {
  const match = manifestFile.match(/^subgraph\.(.+)\.yaml$/);
  return match ? match[1] : null;
}

async function promptForManifest(subgraphDir: string): Promise<string | undefined> {
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
  clack.log.info(`📄 Found ${manifestFiles.length} manifest files: ${manifestFiles.join(', ')}`);
  const selectedManifest = await clack.select({
    message: "Multiple manifest files found. Select which one to deploy:",
    options: manifestFiles.map(file => ({
      value: file,
      label: `📄 ${file}`,
    })),
  }) as string;

  if (clack.isCancel(selectedManifest)) {
    clack.cancel("Operation cancelled");
    process.exit(0);
  }

  return selectedManifest;
}

async function promptForConfiguration({ dryRun }: { dryRun: boolean }): Promise<DeploymentConfig> {

  const title = dryRun ? "🧪 Subgraph Deployment Tool (DRY RUN)" : "🚀 Subgraph Deployment Tool";
  clack.intro(title);

  if (dryRun) {
    clack.log.warn("═══════════════════════════════════════════════");
    clack.log.warn("🧪 DRY RUN MODE: No actual commands will be executed");
    clack.log.warn("═══════════════════════════════════════════════");
  }

  const environment = await clack.select({
    message: "Select deployment environment:",
    options: [
      { value: "staging", label: "🧪 Staging" },
      { value: "production", label: "🚀 Production" },
    ],
  }) as "staging" | "production";

  if (clack.isCancel(environment)) {
    clack.cancel("Operation cancelled");
    process.exit(0);
  }

  const subgraphDirectories = getSubgraphDirectories();

  if (subgraphDirectories.length === 0) {
    clack.log.error("No subgraph directories found with package.json");
    process.exit(1);
  }

  const subgraphName = await clack.select({
    message: "Select subgraph to deploy:",
    options: subgraphDirectories.map(name => ({
      value: name,
      label: `📦 ${name}`,
    })),
  }) as string;

  if (clack.isCancel(subgraphName)) {
    clack.cancel("Operation cancelled");
    process.exit(0);
  }

  // Check for multiple manifest files and prompt for selection
  const subgraphDir = join(process.cwd(), "subgraphs", subgraphName);
  const manifestFile = await promptForManifest(subgraphDir);
  const chain = manifestFile && manifestFile !== 'subgraph.yaml' ? getChainFromManifest(manifestFile): null;
  const subgraphNameWithChain = chain ? `${subgraphName}-${chain}` : subgraphName;

  const action = await clack.select({
    message: "Deployment action:",
    options: [
      { value: "update", label: "🔄 Update existing deployment without overwrite (new subgraph will be created)" },
      { value: "overwrite", label: "🆕 Overwrite deployment (create if not exists)" },
    ],
  }) as "update" | "overwrite";

  if (clack.isCancel(action)) {
    clack.cancel("Operation cancelled");
    process.exit(0);
  }

  // Show confirmation summary
  const { node: nodeURL } = ENVIRONMENT_URLS[environment];
  const finalSubgraphName = action === "update" ? `${subgraphNameWithChain}-new` : subgraphNameWithChain;

  clack.log.info("📋 Deployment Summary:");
  clack.log.info(`   Environment: ${environment === "staging" ? "🧪 Staging" : "🚀 Production"}`);
  clack.log.info(`   Subgraph: ${subgraphName}`);
  clack.log.info(`   Action: ${action === "update" ? "🔄 Update (create new)" : "🆕 Overwrite"}`);
  clack.log.info(`   Deploy as: ${finalSubgraphName}`);
  clack.log.info(`   Target: ${nodeURL}`);
  if (dryRun) {
    clack.log.warn(`   Mode: 🧪 DRY RUN`);
  }

  const shouldContinue = await clack.confirm({
    message: "Continue with deployment?",
  });

  if (clack.isCancel(shouldContinue) || !shouldContinue) {
    clack.cancel("Deployment cancelled");
    process.exit(0);
  }

  return { environment, subgraphName, finalSubgraphName, action, dryRun, manifestFile };
}

async function deploySubgraph({ config, envVars }: { config: DeploymentConfig, envVars: EnvironmentVars }) {
  const { subgraphName, finalSubgraphName, action, dryRun, environment, manifestFile } = config;
  const subgraphDir = join(process.cwd(), "subgraphs", subgraphName);

  clack.log.info(`Deploying subgraph: ${subgraphName}`);
  clack.log.info(`Environment: ${config.environment}`);
  clack.log.info(`Action: ${action}`);
  if (dryRun) {
    clack.log.warn(`🧪 DRY RUN MODE: Commands will be logged but not executed`);
  }

  const spinner = clack.spinner();
  let tempManifestCreated = false;

  try {
    // Change to subgraph directory
    process.chdir(subgraphDir);
    clack.log.info(`📁 Changed to directory: ${subgraphDir}`);

    // Handle manifest file selection for subgraphs with multiple manifests
    if (manifestFile && manifestFile !== 'subgraph.yaml') {
      const sourcePath = join(subgraphDir, manifestFile);
      const targetPath = join(subgraphDir, 'subgraph.yaml');

      if (dryRun) {
        clack.log.info(`cp ${sourcePath} ${targetPath}`);
      } else {
        copyFileSync(sourcePath, targetPath);
        tempManifestCreated = true;
        clack.log.info(`📄 Created temporary manifest: ${manifestFile} -> subgraph.yaml`);
      }
    }

    // Install dependencies
    spinner.start("📦 Installing dependencies...");
    if (dryRun) {
      clack.log.info(`yarn install --frozen-lockfile`);
    } else {
      await exec("yarn install --frozen-lockfile");
    }
    spinner.stop("✅ Dependencies installed");

    // Generate code and build
    spinner.start("🔨 Generating code and building...");
    if (dryRun) {
      clack.log.info(`yarn graph codegen`);
      clack.log.info(`yarn graph build`);
    } else {
      await exec("yarn graph codegen");
      await exec("yarn graph build");
    }
    spinner.stop("✅ Code generated and built");

    // TODO: read from package.json and manage version
    const version = "0.1.0";

    clack.log.info(`📋 Version: ${version}`);

    // Build node URL with basic auth credentials
    const envUrls = ENVIRONMENT_URLS[environment];
    const nodeUrl = `https://${envVars.BASIC_AUTH_USER}:${envVars.BASIC_AUTH_PASSWORD}@${envUrls.node}`;

    // Prepare graph command options
    const nodeOption = `--node=${nodeUrl}`;
    const ipfsOption = `--ipfs=${envVars.IPFS_REGISTRY}`;
    const versionOption = `-l=${version}`;

    // Create + deploy subgraph
    spinner.start(`🚢 Deploying ${finalSubgraphName}...`);

    if (dryRun) {
      clack.log.info(`yarn graph create [omitted] ${finalSubgraphName}`);
      clack.log.info(`yarn graph deploy [omitted] ${finalSubgraphName} ${versionOption}`);
      spinner.stop(`🧪 Would deploy ${finalSubgraphName}`);
    } else {
      await exec(`yarn graph create ${nodeOption} ${finalSubgraphName}`);
      await exec(`yarn graph deploy ${nodeOption} ${ipfsOption} ${finalSubgraphName} ${versionOption}`);
      spinner.stop(`✅ Successfully deployed ${finalSubgraphName}`);
    }

    const successMessage = dryRun
      ? `🧪 Dry run completed successfully!`
      : `🎉 Deployment completed successfully!`;
    clack.outro(successMessage);

    // Clean up temporary manifest file
    if (tempManifestCreated && !dryRun) {
      const tempManifestPath = join(subgraphDir, 'subgraph.yaml');
      if (existsSync(tempManifestPath)) {
        unlinkSync(tempManifestPath);
        clack.log.info(`🧹 Cleaned up temporary manifest file`);
      }
    }

  } catch (error) {
    spinner.stop("❌ Operation failed");

    // Clean up temporary manifest file even on error
    if (tempManifestCreated && !dryRun) {
      const tempManifestPath = join(subgraphDir, 'subgraph.yaml');
      if (existsSync(tempManifestPath)) {
        unlinkSync(tempManifestPath);
        clack.log.info(`🧹 Cleaned up temporary manifest file after error`);
      }
    }

    clack.log.error(`Error: ${error}`);
    process.exit(1);
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("dry-run", {
      alias: "d",
      type: "boolean",
      default: false,
      description: "Run in dry-run mode (no commands executed)"
    })
    .help()
    .argv;

  // Validate environment variables
  const envVars = await validateEnvironmentVariables();
  const config = await promptForConfiguration({ dryRun: argv["dry-run"] });

  await deploySubgraph({ config, envVars });
}

main().catch(console.error);