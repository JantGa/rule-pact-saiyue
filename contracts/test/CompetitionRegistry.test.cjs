const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("CompetitionRegistry", function () {
  async function deployFixture() {
    const [owner, alice, bob, outsider] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("CompetitionRegistry");
    const registry = await Registry.deploy(owner.address);
    await registry.waitForDeployment();

    const id = ethers.keccak256(ethers.toUtf8Bytes("match-001"));
    const rulesHash = ethers.keccak256(ethers.toUtf8Bytes("rules-v1"));
    return { registry, owner, alice, bob, outsider, id, rulesHash };
  }

  it("creates a match with an exact participant set and rules commit", async function () {
    const { registry, owner, alice, bob, id, rulesHash } = await loadFixture(deployFixture);

    await expect(
      registry.createCompetition(id, rulesHash, [alice.address, bob.address], "ipfs://rules")
    )
      .to.emit(registry, "CompetitionCreated")
      .withArgs(id, owner.address, rulesHash, "ipfs://rules");

    const match = await registry.getCompetition(id);
    expect(match.creator).to.equal(owner.address);
    expect(match.rulesHash).to.equal(rulesHash);
    expect(match.state).to.equal(1);
    expect(await registry.participants(id, alice.address)).to.equal(true);
    expect(await registry.participants(id, bob.address)).to.equal(true);
  });

  it("rejects duplicates and short participant sets", async function () {
    const { registry, alice, bob, id, rulesHash } = await loadFixture(deployFixture);
    await expect(
      registry.createCompetition(id, rulesHash, [alice.address, alice.address], "ipfs://rules")
    ).to.be.revertedWithCustomError(registry, "DuplicateParticipant");

    await expect(
      registry.createCompetition(id, rulesHash, [alice.address], "ipfs://rules")
    ).to.be.revertedWithCustomError(registry, "InvalidParticipantCount");
  });

  it("enforces creator-controlled ordered rounds and finalization", async function () {
    const { registry, alice, bob, outsider, id, rulesHash } = await loadFixture(deployFixture);
    await registry.createCompetition(id, rulesHash, [alice.address, bob.address], "ipfs://rules");
    const participantsHash = ethers.keccak256(ethers.solidityPacked(["address", "address"], [alice.address, bob.address]));
    await expect(registry.startCompetition(id, participantsHash))
      .to.emit(registry, "CompetitionStarted")
      .withArgs(id, participantsHash, 2);

    const roundHash = ethers.keccak256(ethers.toUtf8Bytes("round-1"));
    await expect(registry.connect(outsider).recordRound(id, 1, roundHash))
      .to.be.revertedWithCustomError(registry, "Unauthorized");
    await expect(registry.recordRound(id, 2, roundHash))
      .to.be.revertedWithCustomError(registry, "InvalidRound");

    await registry.recordRound(id, 1, roundHash);
    const resultHash = ethers.keccak256(ethers.toUtf8Bytes("result"));
    await expect(registry.finalizeCompetition(id, resultHash, alice.address, "ipfs://evidence"))
      .to.emit(registry, "CompetitionFinalized")
      .withArgs(id, resultHash, alice.address, "ipfs://evidence");
  });

  it("records a participant dispute exactly once", async function () {
    const { registry, alice, bob, outsider, id, rulesHash } = await loadFixture(deployFixture);
    await registry.createCompetition(id, rulesHash, [alice.address, bob.address], "ipfs://rules");
    await registry.startCompetition(id, ethers.id("participants"));
    await registry.recordRound(id, 1, ethers.id("round"));
    await registry.finalizeCompetition(id, ethers.id("result"), alice.address, "ipfs://evidence");

    const reasonHash = ethers.id("score-was-misread");
    await expect(registry.connect(bob).raiseDispute(id, reasonHash))
      .to.emit(registry, "DisputeRaised")
      .withArgs(id, bob.address, reasonHash);
    await expect(registry.connect(bob).raiseDispute(id, ethers.id("again")))
      .to.be.revertedWithCustomError(registry, "AlreadyDisputed");
    await expect(registry.connect(outsider).raiseDispute(id, ethers.id("outsider")))
      .to.be.revertedWithCustomError(registry, "Unauthorized");
    expect(await registry.disputeCount(id)).to.equal(1);
  });
});
