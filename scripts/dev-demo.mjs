import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const envPath = path.join(rootDir, ".env.local");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const dockerCommand = "docker";

const fileEnv = loadEnvFile(envPath);
const env = {
  ...process.env,
  ...fileEnv,
};

applyDefault(env, "OPENWA_API_BASE_URL", "http://localhost:2785/api");
env.OPENWA_API_KEY = "dev-admin-key";
applyDefault(env, "WHATSAPP_LOG_EMPTY_POLLS", "true");
applyDefault(env, "WHATSAPP_WORKER_INTERVAL_MS", "5000");
applyDefault(env, "WHATSAPP_RETRY_DELAY_MS", "60000");
applyDefault(env, "WHATSAPP_MAX_PER_RUN", "20");
applyDefault(env, "FORCE_COLOR", "1");

printBanner(env);

const children = [
  startProcess("app", npmCommand, ["run", "dev"]),
  startProcess("openwa", dockerCommand, [
    "compose",
    "-f",
    "docker-compose.worker.yml",
    "up",
    "--build",
  ]),
];

let shuttingDown = false;

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("uncaughtException", (error) => {
  console.error(error);
  shutdown(1);
});

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const parsed = {};
  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (!key) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = stripInlineComment(value);
    }

    parsed[key] = value;
  }

  return parsed;
}

function stripInlineComment(value) {
  const match = value.match(/\s+#/);
  if (!match || match.index === undefined) return value;
  return value.slice(0, match.index).trimEnd();
}

function applyDefault(target, key, value) {
  if (!target[key]) target[key] = value;
}

function printBanner(currentEnv) {
  console.log("");
  console.log("BayarLah local reminder demo");
  console.log("--------------------------------");
  console.log(`App:        http://localhost:3000`);
  console.log(`OpenWA API: ${currentEnv.OPENWA_API_BASE_URL}`);
  console.log(`Worker poll: ${currentEnv.WHATSAPP_WORKER_INTERVAL_MS}ms`);

  if (!fs.existsSync(envPath)) {
    console.log("");
    console.log("Warning: .env.local was not found. Clerk, Supabase, and Prisma env vars may be missing.");
  }

  console.log("");
  console.log("Test flow:");
  console.log("1. Open http://localhost:3000");
  console.log("2. Complete profile and click Start WhatsApp link");
  console.log("3. Scan the WhatsApp QR from your phone");
  console.log("4. Create an expense with a real recipient phone");
  console.log("5. Click Send now and watch the worker log for SENT");
  console.log("");
  console.log("Press Ctrl+C to stop the app, OpenWA Gateway, and worker.");
  console.log("");
}

function startProcess(name, command, args) {
  const { spawnCommand, spawnArgs } = getSpawnConfig(command, args);

  const child = spawn(spawnCommand, spawnArgs, {
    cwd: rootDir,
    env,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => prefixOutput(name, chunk));
  child.stderr.on("data", (chunk) => prefixOutput(name, chunk));

  child.on("error", (error) => {
    console.error(`[${name}] ${error.message}`);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.log(`[${name}] exited with ${reason}`);
    shutdown(code && code !== 0 ? code : 0);
  });

  return child;
}

function getSpawnConfig(command, args) {
  if (process.platform !== "win32") {
    return { spawnCommand: command, spawnArgs: args };
  }

  return {
    spawnCommand: process.env.ComSpec || "cmd.exe",
    spawnArgs: ["/d", "/s", "/c", quoteWindowsCommand([command, ...args])],
  };
}

function quoteWindowsCommand(parts) {
  return parts.map(quoteWindowsArg).join(" ");
}

function quoteWindowsArg(arg) {
  if (!/[()\][%!^"`<>&|,;=\s]/.test(arg)) return arg;
  return `"${arg.replace(/(["^])/g, "^$1")}"`;
}

function prefixOutput(name, chunk) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.length > 0) console.log(`[${name}] ${line}`);
  }
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("");
  console.log("Stopping BayarLah demo processes...");

  for (const child of children) {
    stopProcessTree(child);
  }

  setTimeout(() => process.exit(exitCode), 800);
}

function stopProcessTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  child.kill("SIGTERM");
}
