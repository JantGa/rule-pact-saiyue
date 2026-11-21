require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: "../.env.local" });
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");
const solc = require("solc");

// Use the npm-pinned compiler so tests also run in restricted CI environments.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(
  async ({ solcVersion }, _hre, runSuper) => {
    if (solcVersion !== "0.8.28") return runSuper();
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: "0.8.28",
      longVersion: solc.version()
    };
  }
);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun"
    }
  },
  networks: {
    monadTestnet: {
      url: process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz",
      chainId: 10143,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : []
    }
  }
};

