const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("Set DEPLOYER_PRIVATE_KEY before deploying.");
  }

  const Registry = await hre.ethers.getContractFactory("CompetitionRegistry");
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log(`CompetitionRegistry deployed: ${address}`);
  console.log(`Explorer: https://testnet.monadscan.com/address/${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

