// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title CompetitionRegistry
/// @notice Immutable commitments for competition rules, rounds, results, and disputes.
/// @dev The contract does not execute the rule engine. It anchors the exact artifacts
/// produced by the offchain referee so anyone can later verify what was agreed.
contract CompetitionRegistry is Ownable, Pausable {
    enum State {
        None,
        Open,
        Active,
        Completed
    }

    struct Competition {
        address creator;
        State state;
        uint64 createdAt;
        uint64 completedAt;
        uint32 roundCount;
        uint32 participantCount;
        bytes32 rulesHash;
        bytes32 participantsHash;
        bytes32 resultHash;
        address winner;
        string metadataURI;
        string evidenceURI;
    }

    mapping(bytes32 competitionId => Competition) private competitions;
    mapping(bytes32 competitionId => mapping(address participant => bool)) public participants;
    mapping(bytes32 competitionId => mapping(uint32 round => bytes32 roundHash)) public roundHashes;
    mapping(bytes32 competitionId => mapping(address participant => bytes32 reasonHash)) public disputes;
    mapping(bytes32 competitionId => uint32 count) public disputeCount;

    event CompetitionCreated(
        bytes32 indexed competitionId,
        address indexed creator,
        bytes32 indexed rulesHash,
        string metadataURI
    );
    event CompetitionStarted(
        bytes32 indexed competitionId,
        bytes32 indexed participantsHash,
        uint32 participantCount
    );
    event RoundRecorded(
        bytes32 indexed competitionId,
        uint32 indexed round,
        bytes32 roundHash
    );
    event CompetitionFinalized(
        bytes32 indexed competitionId,
        bytes32 indexed resultHash,
        address indexed winner,
        string evidenceURI
    );
    event DisputeRaised(
        bytes32 indexed competitionId,
        address indexed participant,
        bytes32 indexed reasonHash
    );

    error InvalidId();
    error InvalidRulesHash();
    error InvalidParticipantCount();
    error DuplicateParticipant();
    error CompetitionExists();
    error CompetitionMissing();
    error Unauthorized();
    error InvalidState();
    error InvalidRound();
    error AlreadyDisputed();
    error ZeroAddress();

    constructor(address initialOwner) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
    }

    function createCompetition(
        bytes32 competitionId,
        bytes32 rulesHash,
        address[] calldata participantList,
        string calldata metadataURI
    ) external whenNotPaused {
        if (competitionId == bytes32(0)) revert InvalidId();
        if (rulesHash == bytes32(0)) revert InvalidRulesHash();
        if (competitions[competitionId].state != State.None) revert CompetitionExists();
        if (participantList.length < 2) revert InvalidParticipantCount();

        for (uint256 i = 0; i < participantList.length; i++) {
            address participant = participantList[i];
            if (participant == address(0)) revert ZeroAddress();
            if (participants[competitionId][participant]) revert DuplicateParticipant();
            participants[competitionId][participant] = true;
        }

        competitions[competitionId] = Competition({
            creator: msg.sender,
            state: State.Open,
            createdAt: uint64(block.timestamp),
            completedAt: 0,
            roundCount: 0,
            participantCount: uint32(participantList.length),
            rulesHash: rulesHash,
            participantsHash: bytes32(0),
            resultHash: bytes32(0),
            winner: address(0),
            metadataURI: metadataURI,
            evidenceURI: ""
        });

        emit CompetitionCreated(competitionId, msg.sender, rulesHash, metadataURI);
    }

    function startCompetition(bytes32 competitionId, bytes32 participantsHash) external whenNotPaused {
        Competition storage competition = _competition(competitionId);
        if (competition.creator != msg.sender) revert Unauthorized();
        if (competition.state != State.Open) revert InvalidState();
        if (participantsHash == bytes32(0)) revert InvalidParticipantCount();

        competition.state = State.Active;
        competition.participantsHash = participantsHash;

        emit CompetitionStarted(competitionId, participantsHash, competition.participantCount);
    }

    function recordRound(bytes32 competitionId, uint32 round, bytes32 roundHash) external whenNotPaused {
        Competition storage competition = _competition(competitionId);
        if (competition.creator != msg.sender) revert Unauthorized();
        if (competition.state != State.Active) revert InvalidState();
        if (roundHash == bytes32(0)) revert InvalidRound();
        if (round != competition.roundCount + 1) revert InvalidRound();

        competition.roundCount = round;
        roundHashes[competitionId][round] = roundHash;
        emit RoundRecorded(competitionId, round, roundHash);
    }

    function finalizeCompetition(
        bytes32 competitionId,
        bytes32 resultHash,
        address winner,
        string calldata evidenceURI
    ) external whenNotPaused {
        Competition storage competition = _competition(competitionId);
        if (competition.creator != msg.sender) revert Unauthorized();
        if (competition.state != State.Active) revert InvalidState();
        if (resultHash == bytes32(0)) revert InvalidRulesHash();

        competition.state = State.Completed;
        competition.completedAt = uint64(block.timestamp);
        competition.resultHash = resultHash;
        competition.winner = winner;
        competition.evidenceURI = evidenceURI;

        emit CompetitionFinalized(competitionId, resultHash, winner, evidenceURI);
    }

    function raiseDispute(bytes32 competitionId, bytes32 reasonHash) external {
        Competition storage competition = _competition(competitionId);
        if (!participants[competitionId][msg.sender]) revert Unauthorized();
        if (competition.state != State.Completed) revert InvalidState();
        if (reasonHash == bytes32(0)) revert InvalidRulesHash();
        if (disputes[competitionId][msg.sender] != bytes32(0)) revert AlreadyDisputed();

        disputes[competitionId][msg.sender] = reasonHash;
        disputeCount[competitionId] += 1;
        emit DisputeRaised(competitionId, msg.sender, reasonHash);
    }

    function getCompetition(bytes32 competitionId) external view returns (Competition memory) {
        Competition memory competition = competitions[competitionId];
        if (competition.state == State.None) revert CompetitionMissing();
        return competition;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _competition(bytes32 competitionId) private view returns (Competition storage competition) {
        competition = competitions[competitionId];
        if (competition.state == State.None) revert CompetitionMissing();
    }
}

