const os = require("node:os");
const path = require("node:path");

// Keep test-only Hardhat settings inside the workspace in sandboxed/CI runners.
os.homedir = () => path.join(process.cwd(), ".hardhat-home");
process.env.HARDHAT_DISABLE_TELEMETRY_PROMPT = "true";
