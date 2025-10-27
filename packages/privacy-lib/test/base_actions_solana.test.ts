import { assert, expect } from "chai";
import { Program, AnchorProvider, web3, Idl } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, Connection } from "@solana/web3.js";
import { ChainedProofSolana } from "../src/solana/ChainedProofSolana";
import { ProvingState } from "../src/lib/reveal_methods/base_functions/ChainedProof";
import { keccak256 } from "ethers";
const IDL = require("../solana/target/idl/chained_proof.json");
const VERIFIER_IDL = require("../solana/target/idl/test_verifier.json");
const OPENING_PROOF_IDL = require("../solana/target/idl/opening_proof.json");
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
    let openingProofProgram: Program;
    let openingProofProgramId: PublicKey;
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
        openingProofProgram = new Program(OPENING_PROOF_IDL, provider);
        openingProofProgramId = new PublicKey(OPENING_PROOF_IDL.address);
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

    it("should verify opening proof", async () => {
        const single_seal = {
            private_package: {
              cyphertexts: [
                "16982517385235112971242805538682991539674085242899156000818465152577523419797",
                "18742539763691724069219257109248375843457333795113490365406170659897041643732",
                "16548023536994534749513391908151122488071528785408395949138273272079136764322",
                "12333723028191341718670456118551703868183032584521226974882843383700916552310",
                "7511099584355164811132927565089156032717684262530170265470006088666463806431",
                "4444112276073414862425643805353557238355521544549177359710979623092277336805",
                "1317015642254345902023403680482907701596083882252064664218008668400732383751",
                "843095409210969390798613424858561825609580695109765778586041659906127298107",
                "20495792065924199163281642851256483323059484754637610104881054281977710521900",
                "2237137695756200030576619852142511917611534283910899524407404725967524610771",
                "2760295844098484198384470390718453994422250199100583755557830132019748738276",
                "20608374960435406591162379792781238284229242136082270361964819738683458739130",
                "33448057010226007746295138780462358600910153545636292881110439099936813942",
                "15678053782456222358104143515580319705233302599375896356956471593089932155357",
                "19210628500006313175665252697046052947097964524829791896577793718104745115582",
                "20617785561810607403137196821691220400279039236906400875978009416428197867948",
              ],
              empheral_keys: [
                "14544446308199393612885262751646915049555227057425108122041441749743440611512",
                "10322537012706285794334222936655803927494851913220727616579453701585467682731",
                "17095621357007752728790804590985941315310338636317072196039586976436011859508",
                "3481888980603586150606672218607738069703250647300072103968196013204467847226",
                "10194476084387233386277414531511478702279819211243201266748315992455826113488",
                "12143182649544341709579933214882845846192481694203274996024355795063696553512",
                "10488250468693789305533770922411167896430202357394266479411643614271938462333",
                "18230376767000500261365304390174864282555302584443686873475390617210319517314",
                "15113004910914718628795873808674250760002322046029048191372755065531014596843",
                "191125126834569504100155676221766887999148539516232601477885029358861667516",
                "827877024771683195938817325802501468812361009628543229740139080880474747656",
                "9014574714625297624533108634891020883558493220020598453624441201402429026132",
                "4765382123453639788990578516194932052437294990921926924098910643108936488397",
                "15866151320718975579886856835320386719963066673712921176130732145063960066878",
                "3077847505363408830985547816827682071028117919775883835301634882035844276436",
                "21082533222236046226843700865328057739495948287443570372830507280883167228164",
              ],
              public_key_he: [
                "12772236142100432363220580144202004037470786201576732455700453255658587434876",
                "11656412224118967689485660395751271887742607868625936986004643474689002039763",
              ],
              public_verification_key: [
                "17533257545329013406634584231070574381906955917363210998406359166916446622305",
                "21099507762175331115957610701841677597707081708062284145922911629925609455812",
              ],
              proof: "0d64ec80b34b20a23af3d5c94e790b0c3232ceca9998b60f1226d21a13fd2fe609024ab3bd3535c9417cbc4e0552f05c3414a6421e92ea789798c4f4af0493531892187154c6e0dec7f0a6f296736f10a77ec91adf162647289b8291d73cbe841e15010c2fa4c374a68ef1b1b196a9ae36d7c9d5835aa6cf072cedcfc8f4f91a0d8c5a8c0b13960d041dc9bdb33eb6a1a9f155ad57f5feba3a82ba6eae5e485f27e0e8c106a925ecd9eff9731963de479027fa6aef0f776cbb4f865690601e5f0f12d14815e007294356e33863b2aeeb10109d93bf7cc53471af7b7f63396b1b108f1be09a2d41292f699e0740cd3bd5c916d1c4814c851e545c57c517f77369",
              public_signals: [
                "0x15d3dc68dda4f176bd7039a56f5bb6298b8f453b681ededa1b91ed55bca23411",
                "0x2c5a8df9f4eab4ec0b952c08f917deb910c8c08fd14d6ebd64cdfe3daf874d84",
                "0x22f8b3185ca5607733b6d5ed2500dbed814dc69102754eac8a3a066e1b4eece0",
                "0x258bc3a3650b27a080627c9588479d8df8a44bb60a6f1715963f73ee372c0a95",
                "0x296fe6cdb5bb4b2621db2bd2c197d6df0a82f802f66c82ee188bb58ee14a68d4",
                "0x2495d972d9f593c3d897945c4580357d27a2dbbbef49188e99d773f40202b1a2",
                "0x1b44a3cd2ba0ea7328670a0e4b34622763941ec17de48138764a6a9bf3c44276",
                "0x109b21b7c4648a31766e733a68ee869c50f20d8bb1a1cd11d187216fa0f323df",
                "0x09d34745e337c744fb462c6d73f00db8e0e9ca3ad3da4b2eda04f6fc67addae5",
                "0x02e96789354061d62e4da7fe5a89aedc48a2af25e383b095d06b007e6c94aa07",
                "0x01dd2cd2c64d455d90b3f200a062020c22ed01e5a8c6fe42fcd7853f243ffe3b",
                "0x2d50350bf0fd4a637b5e4924169a1566849f440371a1d0c15cb26aa0b9482e2c",
                "0x04f22cd102a55e57dd2c983d9201c23b548d363166391361cc92c840282a42d3",
                "0x061a45a739f9f4555cf97cbca338b3de0dafe80b33dbe3d3e522234f474114e4",
                "0x2d8fed4796d595b2c670418d68cc25629a63164d5b1d212fa71755deae645bba",
                "0x0012ee51634dfcb0da832f913cb2e9ebc6b5eca1acc1a3eeb74ffccddab03376",
                "0x22a976c734fa8d3b516c9a787bea40d9dbcb33e017b5655d334e235c73df59dd",
                "0x2a78d495e86f137db4e8d5172196271e541edc5d412667a728966f0b6c84ffbe",
                "0x2d9540ca31b88b4549f91b936c22aec8bd44b556f15e05936802f19812b171ac",
                "0x2027dd690c12c69d24cf4ada7c1d9fe9b53e175d1fd5c024effb9ab254a9c8b8",
                "0x16d25951c843f8acfc4fa81f09b0cf5570776e8ed2719e1e5e563fdb4b012fab",
                "0x25cbc75edf533ee13f976c1a374164dd36a877354184f032fa42b11deabefe34",
                "0x07b2ade83a892f4fcbecdc115ebab8ed4fc64c04cdd26afe1b790556fc17903a",
                "0x1689de75f3d3ba4efbef8efabba50ba70749e4105117df8f104ba4e1aca803d0",
                "0x1ad8cc3db9e21da890eed699996c944fcc9cdd790c0c9669e55948dd52587628",
                "0x173023af7bfa9519856c86fbbb475055a08ddb0d9c45deea57107e84182f827d",
                "0x284e071055c75c095261ed57915e4d7178425cf6ad642a226632ea6d2c6bb682",
                "0x2169a85bb5975bb12852149003551e21f2d87e37c0755af3918ad409e4f448eb",
                "0x006c2c48f5c64b730a22a58480579e498de2df75d4d88f586d4c28d419b1ccbc",
                "0x01d48fd185e0a923d5649883bc8b740315b5def3f33272a34f3bcb2acceef308",
                "0x13ee1187c5f014dee6a9e86e7fabd4147538f9de23ec7dbd0df38b2aad0faf54",
                "0x0a891c56d3afccf873870ad1fa37bc456b514458f77b4ef0d87d0c65551915cd",
                "0x2313ec64aa5d03a110571cbbf5a8035a0479a3abecd16e6b983a45b6452d3b3e",
                "0x06cdfffcfa4bc98b723ab87b4a691bbfc94a55a47f81a5aa0256963c6c3a60d4",
                "0x2e9c4a7afff9580abe2e64f152f0a58a5381ac28e085d1464e6c2bda733f7104",
                "0x26c378db49869af9bbb7d15850241ccd16bf3d39edbd09e8dae8a185fc379261",
                "0x2ea5e5efadebab712fcdbf096dce942daa535e4903baf76731ddf8c41d5940c4",
                "0x1c3cd45890280bdeb8dc1aa8a68fac5d8278fd11317e063c6081e18dba5a2f7c",
                "0x19c54ba72a9fd2a6e2dcaf284d86140117639a3ec494afe08e809a1a25bbe9d3",
                "0x18f7ffe760a383353a9a22f8f55650b332651133720eb324f2f59355a6f13413",
                "0x09c01dd58e69bca940da98f83a9882bfe61a3ac37e7fdb09e0cbc2e7d1ee186f",
              ],
              encrypted_secret: {
                ciphertextHex: "eeda89e11649e66b5885705df155cbc8786225cdf83a0f729f3f7680e838ec",
                R: {
                  x: "2d610b111ab56baf5aed7f8be77ba3ee3f28d9c8216a86b23a16d49642231ed9",
                  y: "0337a7a3a8ef88865c8e36c9f28bc80fd65ca1ed320ba302b5cf944647ce55d1",
                },
              },
              reveal_conditions: [
                {
                  action: "start_unsealing",
                  params: {
                    verifier_address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
                  },
                },
                {
                  action: "prepare_next_proof",
                  params: {
                    verifier_address: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
                  },
                },
                {
                  action: "chain_proof_verify",
                  params: {
                    verifier_address: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
                  },
                },
                {
                  action: "prepare_next_proof",
                  params: {
                    verifier_address: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
                  },
                },
                {
                  action: "pass_signal",
                  params: {
                    public_input_indexes: [
                      2,
                    ],
                    output_proof_indexes: [
                      1,
                    ],
                    output_signal_indexes: [
                      0,
                    ],
                  },
                },
                {
                  action: "validate_data_root",
                  params: {
                    datastream: [
                      0,
                    ],
                    public_input_index: 0,
                    merkle_root_index: 0,
                  },
                },
                {
                  action: "chain_proof_verify",
                  params: {
                    verifier_address: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
                  },
                },
              ],
              unseal_condition_root: "20061761458548145182351324328747993871579153449109654634488832663698704649604",
              metadata_root: "173660542858128846010441379817710838956712879562627660898836191626443914499",
              reveal_value: "9872895762289450720094651880942843777398854369099544479558345220938147181585",
              reveal_collection_id: "reveal_only_normal_trees",
              reveal_collection_inputs: {
                opening_proof_address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
                top_level_merkle_tree_address: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
                sub_tree_merkle_tree_address: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
              },
            },
            public_package: {
              reveal_value: "9872895762289450720094651880942843777398854369099544479558345220938147181585",
              proof: "",
              public_signals: "",
              address: "",
              circuit_id: "",
              data_stream_ids: [
                "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
              ],
              data_stream_urls: [
                "test",
              ],
              processor_url: "https://localhost:3000",
            },
            hidden_package: {
            },
          }
    const proof = Buffer.from(single_seal.private_package.proof, 'hex');
    var publicInputs = single_seal.private_package.public_signals.map(signal => Buffer.from(signal.slice(2), 'hex'));
    publicInputs = publicInputs.slice(0, 10);
    let result: any = null;
    
    try{
        result = await openingProofProgram.methods.verify(proof, publicInputs).accounts({
                openingProof: openingProofProgramId,
            }).view();
    } catch (error) {
        console.error("Error in verify:", error);
        for(let log of error.simulationResponse.logs){
            console.error(log);
        }
        throw error;
    }
        assert.isTrue(result);
    });

    it("should hash equivalently", async () => {
        // Test dryrun_start_proving - compare local vs Solana program
        const publicInputs = [
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123"
        ];
        const proof = "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321";
        
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
        let solanaState4: any = null;
        try{
            solanaState4 = await chainedProofSolana.dryrun_chain_proof_verify(
                solanaState3,
                false
            );
        } catch (error) {
            console.error("Error in dryrun_chain_proof_verify:", error);
            for(let log of error.simulationResponse.logs){
                console.error(log);
            }
            

            throw error;
        }

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

        // // Test dryrun_validate_timestamp
        // const localState7 = chainedProofSolana.dryrun_validate_timestamp_local(
        //     localState6,
        //     0, 0, 0, 1000
        // );
        
        // const solanaState7 = await chainedProofSolana.dryrun_validate_timestamp(
        //     solanaState6,
        //     0, 0, 0, 1000
        // );

        // assert.deepEqual(localState7.current_hash, solanaState7.current_hash);

        // Test dryrun_chain_proof_verify (with proof verification)
        const localState8 = chainedProofSolana.dryrun_chain_proof_verify_local(
            localState6,
            false
        );
        
        const solanaState8 = await chainedProofSolana.dryrun_chain_proof_verify(
            solanaState6,
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
        const proof = "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321";
        
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
        assert.equal(state.prepared_proof.slice(2).length, 4); // 0x9abc = 4 bytes
        
        // After prepare next proof
        state = await chainedProofSolana.dryrun_prepare_next_proof(
            state,
            verifier,
            publicInputs,
            proof
        );
        
        // State should be updated
        assert.equal(state.prepared_public_inputs.length, 2);
        assert.equal(state.prepared_proof.slice(2).length, 4);
        
        // After chain proof verify
        state = await chainedProofSolana.dryrun_chain_proof_verify(
            state,
            true
        );
        
        // Outputs should be added
        assert.equal(state.outputs.length, 2);
        assert.equal(state.prepared_public_inputs.length, 0);
        assert.equal(state.prepared_proof.slice(2).length, 0);
    });
});
