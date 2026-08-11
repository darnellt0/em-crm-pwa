import { spawnSync } from "child_process";
import { existsSync, readdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { loadEnvConfig } from "@next/env";

type CommandResult = {
  ok: boolean;
  output: string;
};

const projectDir = path.resolve(__dirname, "..");
const composeEnv = { ...process.env };

// Match Next.js: .env is loaded first and .env.local may override app values.
loadEnvConfig(projectDir);

const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3001";
const dbContainer = "em_postgres";
const dbUser = "em_app";
const dbName = "em_crm";
let passed = 0;
let failed = 0;

function pass(message: string) {
  console.log(`  ✅ ${message}`);
  passed += 1;
}

function fail(message: string) {
  console.log(`  ❌ ${message}`);
  failed += 1;
}

function warn(message: string) {
  console.log(`  ⚠️  ${message}`);
}

function run(
  command: string,
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  } = {},
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: projectDir,
    encoding: "utf8",
    env: options.env || process.env,
    maxBuffer: 10 * 1024 * 1024,
    timeout: options.timeoutMs || 60_000,
    windowsHide: true,
  });

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const error = result.error ? `${result.error.name}: ${result.error.message}` : "";
  const output = [stdout, stderr, error].filter(Boolean).join("\n").trim();

  return {
    ok: result.status === 0 && !result.error,
    output,
  };
}

function runPnpm(args: string[], timeoutMs = 120_000): CommandResult {
  const pnpmScript = process.env.npm_execpath;
  if (pnpmScript && existsSync(pnpmScript)) {
    return run(process.execPath, [pnpmScript, ...args], { timeoutMs });
  }

  return run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, {
    timeoutMs,
  });
}

function runDocker(
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  } = {},
): CommandResult {
  return run("docker", args, options);
}

function logFailure(name: string, result: CommandResult): string {
  const logPath = path.join(tmpdir(), name);
  writeFileSync(logPath, result.output ? `${result.output}\n` : "", "utf8");

  if (result.output) {
    const tail = result.output.split(/\r?\n/).slice(-20);
    for (const line of tail) {
      console.log(`       ${line}`);
    }
  }

  return logPath;
}

function runPnpmCheck(
  label: string,
  logName: string,
  args: string[],
  timeoutMs = 120_000,
) {
  const result = runPnpm(args, timeoutMs);
  if (result.ok) {
    pass(label);
    return;
  }

  const logPath = logFailure(logName, result);
  fail(`${label} — see ${logPath}`);
}

function hasGeneratedPrismaClient(): boolean {
  if (existsSync(path.join(projectDir, "node_modules", ".prisma", "client"))) {
    return true;
  }

  const pnpmDir = path.join(projectDir, "node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) {
    return false;
  }

  return readdirSync(pnpmDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("@prisma+client@"))
    .some((entry) =>
      existsSync(
        path.join(
          pnpmDir,
          entry.name,
          "node_modules",
          ".prisma",
          "client",
          "default.js",
        ),
      ),
    );
}

async function fetchWithTimeout(url: string, timeoutMs = 10_000) {
  return fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function verifyApplication() {
  console.log("");
  console.log("[ Application ]");

  let signInResponse: Response;
  try {
    signInResponse = await fetchWithTimeout(`${baseUrl}/auth/signin`);
  } catch {
    fail(`App is not responding at ${baseUrl} — run: pnpm dev`);
    warn("Skipping page and API smoke checks until the app is running");
    return;
  }

  if (signInResponse.status !== 200) {
    fail(
      `App returned HTTP ${signInResponse.status} at ${baseUrl}/auth/signin — expected 200`,
    );
    warn("Skipping page and API smoke checks until the sign-in page is healthy");
    return;
  }
  pass(`App is running at ${baseUrl}`);

  const signInBody = await signInResponse.text();
  if (signInBody.includes("Elevated Movements")) {
    pass("Sign-in page renders correctly");
  } else {
    fail("Sign-in page does not contain expected content");
  }

  const protectedRoutes = [
    {
      label: "Dashboard API is auth-protected",
      path: "/api/dashboard",
    },
    {
      label: "Contacts API is auth-protected",
      path: "/api/contacts",
    },
    {
      label: "Internal operations API is token-protected",
      path: "/api/internal/ops-summary",
    },
  ];

  for (const route of protectedRoutes) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}${route.path}`);
      if (response.status === 401) {
        pass(route.label);
      } else {
        fail(
          `${route.path} returned HTTP ${response.status} — expected 401 without credentials`,
        );
      }
    } catch {
      fail(`${route.path} did not respond`);
    }
  }
}

async function verifyOllama() {
  console.log("");
  console.log("[ AI / Ollama (optional) ]");

  const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
  try {
    const response = await fetchWithTimeout(`${ollamaUrl}/api/tags`, 3_000);
    if (response.status === 200) {
      pass(`Ollama is running at ${ollamaUrl}`);
      return;
    }
    warn(`Ollama returned HTTP ${response.status} at ${ollamaUrl}`);
  } catch {
    warn(`Ollama is not running at ${ollamaUrl}`);
  }

  console.log(
    "       AI memory extraction and semantic search are disabled; core CRM features still work.",
  );
}

async function main() {
  console.log("");
  console.log("============================================");
  console.log("  Elevated Movements CRM — Readiness Check");
  console.log("============================================");
  console.log("");
  console.log("[ Infrastructure ]");

  let dockerReady = false;
  let databaseRunning = false;

  const dockerCli = runDocker(["--version"]);
  if (!dockerCli.ok) {
    fail("Docker CLI is not installed — install Docker Desktop first");
  } else {
    const composeConfig = runDocker(["compose", "config", "--quiet"], {
      env: composeEnv,
    });
    if (composeConfig.ok) {
      pass("Docker Compose configuration is valid");
    } else {
      const logPath = logFailure("em_crm_compose_config.log", composeConfig);
      fail(`Docker Compose configuration is invalid — see ${logPath}`);
    }

    const dockerInfo = runDocker(["info"]);
    if (dockerInfo.ok) {
      dockerReady = true;
      pass("Docker is running");
    } else {
      fail("Docker is installed but unavailable — start Docker Desktop first");
    }
  }

  if (dockerReady) {
    const containers = runDocker(["ps", "--format", "{{.Names}}"]);
    const names = containers.output.split(/\r?\n/);
    if (containers.ok && names.includes(dbContainer)) {
      databaseRunning = true;
      pass(`Database container (${dbContainer}) is running`);
    } else {
      fail(
        `Database container (${dbContainer}) is not running — run: docker compose up -d`,
      );
    }
  } else {
    warn("Skipping container checks because Docker is unavailable");
  }

  console.log("");
  console.log("[ Database ]");

  if (databaseRunning) {
    const databaseConnection = runDocker([
      "exec",
      dbContainer,
      "psql",
      "-U",
      dbUser,
      "-d",
      dbName,
      "-tAc",
      "SELECT 1",
    ]);
    if (databaseConnection.ok && databaseConnection.output.trim() === "1") {
      pass("Database connection successful");
    } else {
      fail("Cannot connect to database — run: docker compose up -d && pnpm db:push");
    }

    const vectorCheck = runDocker([
      "exec",
      dbContainer,
      "psql",
      "-U",
      dbUser,
      "-d",
      dbName,
      "-tAc",
      "SELECT COUNT(*) FROM pg_extension WHERE extname='vector'",
    ]);
    if (vectorCheck.ok && Number(vectorCheck.output.trim()) >= 1) {
      pass("pgvector extension is installed");
    } else {
      fail("pgvector extension is missing — run: pnpm db:push");
    }

    const userCount = runDocker([
      "exec",
      dbContainer,
      "psql",
      "-U",
      dbUser,
      "-d",
      dbName,
      "-tAc",
      'SELECT COUNT(*) FROM "User"',
    ]);
    if (userCount.ok && Number(userCount.output.trim()) >= 1) {
      pass(`Seed users exist (${userCount.output.trim()} user(s) in database)`);
    } else {
      fail("No users found — run: pnpm db:seed");
    }

    const adminCount = runDocker([
      "exec",
      dbContainer,
      "psql",
      "-U",
      dbUser,
      "-d",
      dbName,
      "-tAc",
      `SELECT COUNT(*) FROM "User" WHERE role='admin'`,
    ]);
    if (adminCount.ok && Number(adminCount.output.trim()) >= 1) {
      pass(`At least one admin user exists (${adminCount.output.trim()} admin(s))`);
    } else {
      fail("No admin users found — run: pnpm db:seed");
    }
  } else {
    warn(`Skipping database queries because ${dbContainer} is not running`);
  }

  console.log("");
  console.log("[ Node / Prisma / Quality ]");

  if (hasGeneratedPrismaClient()) {
    pass("Prisma client is generated");
  } else {
    fail("Prisma client is not generated — run: pnpm exec prisma generate");
  }

  runPnpmCheck(
    "Prisma schema validation passed",
    "em_crm_prisma_validate.log",
    ["exec", "prisma", "validate"],
  );
  runPnpmCheck("TypeScript typecheck passed", "em_crm_typecheck.log", ["typecheck"]);
  runPnpmCheck("ESLint passed", "em_crm_lint.log", ["lint"]);
  runPnpmCheck("Unit tests passed", "em_crm_tests.log", ["test"], 180_000);

  await verifyApplication();
  await verifyOllama();

  console.log("");
  console.log("============================================");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("============================================");
  console.log("");

  if (failed > 0) {
    console.log("  ⚠️  Some checks failed. See LOCAL_SETUP.md for troubleshooting.");
    process.exitCode = 1;
    return;
  }

  console.log("  🎉 All required checks passed! The CRM is ready for use.");
  console.log(`     Sign in at: ${baseUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
