import { assert, expect } from "chai";
import { Program, AnchorProvider, web3, Idl } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, Connection } from "@solana/web3.js";
import { ChainedProofSolana } from "../src/solana/ChainedProofSolana";
import { ProvingState } from "../src/lib/reveal_methods/base_functions/ChainedProof";
import { keccak256 } from "ethers";
const IDL = require("../solana/target/idl/chained_proof.json");
const VERIFIER_IDL = require("../solana/target/idl/test_verifier.json");
/**
 * IMPORTANT: This test requires a Solana test validator to be running.
 * 
 * To run this test properly, use one of these VS Code launch configurations:
 * 
 * 1. "Debug Test Base Actions Solana" - Automatically sets up the Solana environment
 *    (starts validator, builds program, deploys program, then runs tests)
 * 
 * 2. "Debug Test Base Actions Solana (Manual Setup)" - For manual setup
 *    - Start validator: `solana-test-validator --reset`
 *    - Deploy program: `cd packages/privacy-lib/solana && anchor deploy`
 *    - Then run this test
 * 
 * The first option is recommended as it handles all setup automatically.
 */

describe("ChainedProofSolana", () => {
    let program: Program;
    let provider: AnchorProvider;
    let chainedProofSolana: ChainedProofSolana;
    let chainedProofPDA: PublicKey;
    let verifierAddress: PublicKey;
    let publicProofVerifier: PublicKey;
    let forcedOpeningVerifier: PublicKey;
    before(async () => {
        // Setup connection to local Solana test validator
        // NOTE: Validator should be started manually before running this test
        const connection = new Connection("http://localhost:8899", "confirmed");
        const payer = Keypair.fromSecretKey(Buffer.from([226,239,137,69,66,201,64,131,143,42,72,106,119,252,244,253,205,137,140,98,39,121,24,144,79,255,186,186,44,176,245,151,229,233,147,121,65,54,140,221,94,223,134,217,245,17,135,7,172,138,132,49,104,40,64,89,151,198,142,46,226,83,138,225]));
        
        // Airdrop SOL to payer for testing
        try {
            await connection.requestAirdrop(payer.publicKey, 2 * web3.LAMPORTS_PER_SOL);
        } catch (error) {
            console.error("Airdrop failed:", error);
            console.log("Airdrop failed, using existing keypair");
        }
        
        // Create a proper wallet using the payer keypair
        const wallet = {
            publicKey: payer.publicKey,
            signTransaction: async (tx: any) => {
                var res = tx.sign(payer);
                return tx;
            },
            signAllTransactions: async (txs: any[]) => {
                return txs.map(tx => {
                    tx.sign(payer);
                    return tx;
                });
            }
        };

        provider = new AnchorProvider(
            connection,
            wallet,
            { commitment: "confirmed" }
        );
        
        // Load the program with the actual IDL
        var idl = IDL as Idl;
        const programId = new PublicKey(idl.address);
        
        // Create the program with the IDL
        try {
            program = new Program(idl, provider);
        } catch (error) {
            console.error("Error creating program with IDL:", error);
            // Create a minimal program structure that matches the expected interface
        }

        // Generate PDAs
        chainedProofPDA = PublicKey.findProgramAddressSync(
            [Buffer.from("chained_proof")],
            programId
        )[0];
        console.log("ChainedProof PDA:", chainedProofPDA.toString());
        // Create verifier addresses
        verifierAddress = new PublicKey(VERIFIER_IDL.address);
        publicProofVerifier = Keypair.generate().publicKey;
        forcedOpeningVerifier = Keypair.generate().publicKey;
        console.log("Verifier addresses:",
             verifierAddress.toString(), 
             publicProofVerifier.toString(), 
             forcedOpeningVerifier.toString());

        chainedProofSolana = new ChainedProofSolana(
            program,
            provider,
            chainedProofPDA,
            publicProofVerifier,
            forcedOpeningVerifier
        );

        // Initialize the ChainedProof program (only if not already initialized)
        await chainedProofSolana.initialize();
    });

    it("should hash equivalently", async () => {
        // Test dryrun_start_proving - compare local vs Solana program
        const publicInputs = [
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123"
        ];
        const proof = "0x7890";
        
        const localState = chainedProofSolana.dryrun_start_proving_local(
            verifierAddress,
            publicInputs,
            proof
        );
        
        const solanaState = await chainedProofSolana.dryrun_start_proving(
            verifierAddress,
            publicInputs,
            proof,
            false
        );

        assert.deepEqual(localState.current_hash, solanaState.current_hash);
        assert.deepEqual(localState.expected_hash, solanaState.expected_hash);

        // Test dryrun_prepare_next_proof
        const localState2 = chainedProofSolana.dryrun_prepare_next_proof_local(
            localState,
            verifierAddress,
            publicInputs,
            proof
        );
        
        const solanaState2 = await chainedProofSolana.dryrun_prepare_next_proof(
            solanaState,
            verifierAddress,
            publicInputs,
            proof
        );

        assert.deepEqual(localState2.current_hash, solanaState2.current_hash);

        // Test dryrun_chain_static_input
        const inputs = ["0x1234", "0x4567"];
        const indexes = [0, 1];
        
        const localState3 = chainedProofSolana.dryrun_chain_static_input_local(
            localState2,
            inputs,
            indexes
        );
        
        const solanaState3 = await chainedProofSolana.dryrun_chain_static_input(
            solanaState2,
            inputs,
            indexes
        );

        assert.deepEqual(localState3.current_hash, solanaState3.current_hash);

        // Test dryrun_chain_proof_verify
        const localState4 = chainedProofSolana.dryrun_chain_proof_verify_local(
            localState3,
            true
        );
        
        const solanaState4 = chainedProofSolana.dryrun_chain_proof_verify_local(
            solanaState3,
            true
        );

        assert.deepEqual(localState4.current_hash, solanaState4.current_hash);

        // Test dryrun_prepare_next_proof again
        const localState5 = chainedProofSolana.dryrun_prepare_next_proof_local(
            localState4,
            verifierAddress,
            publicInputs,
            proof
        );
        
        const solanaState5 = await chainedProofSolana.dryrun_prepare_next_proof(
            solanaState4,
            verifierAddress,
            publicInputs,
            proof
        );

        assert.deepEqual(localState5.current_hash, solanaState5.current_hash);

        // Test dryrun_chain_pass_signal
        const publicInputIndexes = [0, 1];
        const outputProofIndexes = [0, 0];
        const outputIndexes = [0, 1];
        
        const localState6 = chainedProofSolana.dryrun_chain_pass_signal_local(
            localState5,
            publicInputIndexes,
            outputProofIndexes,
            outputIndexes
        );
        
        const solanaState6 = await chainedProofSolana.dryrun_chain_pass_signal(
            solanaState5,
            publicInputIndexes,
            outputProofIndexes,
            outputIndexes
        );

        assert.deepEqual(localState6.current_hash, solanaState6.current_hash);

        // Test dryrun_validate_timestamp
        const localState7 = chainedProofSolana.dryrun_validate_timestamp_local(
            localState6,
            0, 0, 0, 1000
        );
        
        const solanaState7 = await chainedProofSolana.dryrun_validate_timestamp(
            solanaState6,
            0, 0, 0, 1000
        );

        assert.deepEqual(localState7.current_hash, solanaState7.current_hash);

        // Test dryrun_chain_proof_verify (with proof verification)
        const localState8 = chainedProofSolana.dryrun_chain_proof_verify_local(
            localState7,
            false
        );
        
        const solanaState8 = await chainedProofSolana.dryrun_chain_proof_verify(
            solanaState7,
            false
        );

        assert.deepEqual(localState8.current_hash, solanaState8.current_hash);
    });

    it("should handle hash consistency across different operations", async () => {
        const verifier = Keypair.generate().publicKey;
        const publicInputs = [
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321"
        ];
        const proof = "0xabcdef1234567890";
        
        // Start proving
        let state = await chainedProofSolana.dryrun_start_proving(
            verifier,
            publicInputs,
            proof,
            false
        );
        
        const initialHash = state.current_hash;
        
        // Prepare next proof
        state = await chainedProofSolana.dryrun_prepare_next_proof(
            state,
            verifier,
            publicInputs,
            proof
        );
        
        // Hash should have changed
        assert.notDeepEqual(state.current_hash, initialHash);
        
        // Chain static input
        state = await chainedProofSolana.dryrun_chain_static_input(
            state,
            ["0x1111111111111111", "0x2222222222222222"],
            [0, 1]
        );
        
        // Hash should have changed again
        assert.notDeepEqual(state.current_hash, initialHash);
        
        // Verify proof
        state = await chainedProofSolana.dryrun_chain_proof_verify(
            state,
            true
        );
        
        // Hash should have changed again
        assert.notDeepEqual(state.current_hash, initialHash);
    });

    it("should maintain state consistency", async () => {
        const verifier = Keypair.generate().publicKey;
        const publicInputs = [
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "0x567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234"
        ];
        const proof = "0x9abc";
        
        let state = await chainedProofSolana.dryrun_start_proving(
            verifier,
            publicInputs,
            proof,
            false
        );
        
        // Initial state checks
        assert.equal(state.current_index, 0);
        assert.equal(state.outputs.length, 1);
        assert.equal(state.outputs[0].length, 2);
        assert.equal(state.prepared_public_inputs.length, 2);
        assert.equal(state.prepared_proof.length, 4); // 0x9abc = 4 bytes
        
        // After prepare next proof
        state = await chainedProofSolana.dryrun_prepare_next_proof(
            state,
            verifier,
            publicInputs,
            proof
        );
        
        // State should be updated
        assert.equal(state.prepared_public_inputs.length, 2);
        assert.equal(state.prepared_proof.length, 4);
        
        // After chain proof verify
        state = await chainedProofSolana.dryrun_chain_proof_verify(
            state,
            true
        );
        
        // Outputs should be added
        assert.equal(state.outputs.length, 2);
        assert.equal(state.prepared_public_inputs.length, 0);
        assert.equal(state.prepared_proof.length, 0);
    });
});
