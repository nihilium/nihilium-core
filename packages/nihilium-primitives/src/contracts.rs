use alloy_sol_macro::sol;
use serde::{Serialize, Deserialize};

sol! {
    #[sol(rpc)]
    #[derive(Serialize, Deserialize, Debug)]
    ChainedProof,
    "../../contracts/out/ChainedProof.sol/ChainedProof.json"
}

sol! {
    #[sol(rpc)]
    #[derive(Serialize, Deserialize, Debug)]
    EmpheralMerkleTreeKeccak,
    "../../contracts/out/EmpheralMerkleTreeKeccak.sol/EmpheralMerkleTreeKeccak.json"
}

sol! {
    #[sol(rpc)]
    #[derive(Serialize, Deserialize, Debug)]
    SubTreeMerkleProof,
    "../../contracts/out/SubTreeMerkleProof.sol/SubTreeMerkleProof.json"
}

sol! {
    #[sol(rpc)]
    #[derive(Serialize, Deserialize, Debug)]
    IVerifier,
    "../../contracts/out/IVerifier.sol/IVerifier.json"
}

sol! {
    #[sol(rpc)]
    #[derive(Serialize, Deserialize, Debug)]
    TestVerifyAlwaysTrue,
    "../../contracts/out/TestVerifyAlwaysTrue.sol/TestVerifyAlwaysTrue.json"
}

sol! {
    #[sol(rpc)]
    #[derive(Serialize, Deserialize, Debug)]
    TimeAfterProof,
    "../../contracts/out/TimeAfterProof.sol/TimeAfterProof.json"
}

sol! {
    #[sol(rpc)]
    #[derive(Serialize, Deserialize, Debug)]
    TimeBeforeProof,
    "../../contracts/out/TimeBeforeProof.sol/TimeBeforeProof.json"
}

sol! {
    #[sol(rpc)]
    #[derive(Serialize, Deserialize, Debug)]
    TimeBetweenOffsetProof,
    "../../contracts/out/TimeBetweenOffsetProof.sol/TimeBetweenOffsetProof.json"
}

sol! {
    #[sol(rpc)]
    #[derive(Serialize, Deserialize, Debug)]
    TimeBetweenProof,
    "../../contracts/out/TimeBetweenProof.sol/TimeBetweenProof.json"
}

sol! {
    #[sol(rpc)]
    #[derive(Serialize, Deserialize, Debug)]
    TopLevelMerkleProof,
    "../../contracts/out/TopLevelMerkleProof.sol/TopLevelMerkleProof.json"
}

sol! {
    #[sol(rpc)]
    #[derive(Serialize, Deserialize, Debug)]
    EncryptProof,
    "../../contracts/out/encrypt_proof.sol/encrypt_proof.json"
}

sol! {
    #[sol(rpc)]
    #[derive(Debug)]
    OpeningProof,
    "../../contracts/out/opening_proof.sol/opening_proof.json"
}
