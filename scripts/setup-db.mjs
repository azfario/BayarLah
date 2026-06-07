import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const env = {
  ...loadEnvFile(".env.local"),
  ...process.env,
};
const directUrl = env.DIRECT_URL?.trim();
const databaseUrl = directUrl || env.DATABASE_URL?.trim();
const sqlFile = process.argv[2] || "supabase/profile-setup.sql";
const sqlPath = path.resolve(sqlFile);

if (!databaseUrl) {
  console.error("Set DIRECT_URL or DATABASE_URL before running database setup.");
  process.exit(1);
}

if (!fs.existsSync(sqlPath)) {
  console.error(`SQL file not found: ${sqlFile}`);
  process.exit(1);
}

const npmCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(
  npmCommand,
  [
    "prisma",
    "db",
    "execute",
    "--file",
    sqlPath,
    "--schema",
    "prisma/schema.prisma",
  ],
  {
    env: {
      ...env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: directUrl || databaseUrl,
    },
    shell: false,
    stdio: "inherit",
  }
);

child.on("error", (error) => {
  console.error(`Unable to start Prisma: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return {};

  const values = {};
  for (const rawLine of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
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
      const commentIndex = value.search(/\s+#/);
      if (commentIndex !== -1) value = value.slice(0, commentIndex).trimEnd();
    }

    values[key] = value;
  }

  return values;
}
