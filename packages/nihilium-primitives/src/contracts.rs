use alloy_sol_macro::sol;
use serde::{Serialize, Deserialize};

// ChainedProof

sol! {
    #[sol(rpc)]
    #[derive(Serialize, Deserialize, Debug)]
    ChainedProof,
    "../../contracts/out/ChainedProof.sol/ChainedProof.json"
}

sol! {
    #[sol(rpc)]
    #[derive(Serialize, Deserialize, Debug)]
    HashFunction,
    "../../contracts/out/ChainedProof.sol/HashFunction.json"
}

// EmpheralMerkleTreeKeccak

sol! {
    #[sol(rpc)]
    #[derive(Serialize, Deserialize, Debug)]
    HashFunction,
    "../../contracts/out/EmpheralMerkleTreeKeccak.sol/EmpheralMerkleTreeKeccak.json"
}