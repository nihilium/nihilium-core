import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { ChainedProofSolana } from "../src/solana/ChainedProofSolana";

async function main() {
    // Setup provider
    const payer = Keypair.generate();
    const connection = new (await import("@solana/web3.js")).Connection("http://localhost:8899");
    
    const provider = new AnchorProvider(
        connection,
        { publicKey: payer.publicKey, signTransaction: async (tx) => tx, signAllTransactions: async (txs) => txs },
        { commitment: "confirmed" }
    );

    // Load program (in real deployment, this would be your compiled program)
    const programId = new PublicKey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
    const program = new Program({} as any, programId, provider);

    // Generate PDAs
    const chainedProofPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("chained_proof")],
        programId
    )[0];

    const publicProofVerifier = Keypair.generate().publicKey;
    const forcedOpeningVerifier = Keypair.generate().publicKey;

    // Initialize ChainedProof
    const chainedProof = new ChainedProofSolana(
        program,
        provider,
        chainedProofPDA,
        publicProofVerifier,
        forcedOpeningVerifier
    );

    try {
        await chainedProof.initialize();
        console.log("ChainedProof initialized successfully!");
        console.log("ChainedProof PDA:", chainedProofPDA.toString());
        console.log("Public Proof Verifier:", publicProofVerifier.toString());
        console.log("Forced Opening Verifier:", forcedOpeningVerifier.toString());
    } catch (error) {
        console.error("Failed to initialize ChainedProof:", error);
    }
}

main().catch(console.error);
