//Tests that test hashing equilivance of actions.ts and the solidity contract using hardhat

import { assert, expect } from "chai";
import { ChainedProof } from "../src/lib/unseal_conditions/ChainedProof";
import { DefaultAnchoredOpeningProofModule } from "../src/lib/unseal_conditions/modules";
import { ProofLibrary } from "../src/lib/unseal_conditions/proofs";
import { StandardModuleLibrary } from "../src/lib/unseal_conditions/modules";
import * as staticContracts from "../src/static_contracts";
import { ChainedProofWrapper } from "../src/lib/contract_wrappers/ChainedProofWrapper";
import { ethers } from "hardhat";
import { Provider, Signer } from "ethers";
import { deployedProtocolContracts } from "../src/static_contracts";
import { UnsealConditionCollection } from "../src/lib/unseal_conditions/collections/UnsealConditionCollection";
import { ChangedType, CollectionNode, CollectionEdge, CollectionEdgeInput } from "../src/lib/unseal_conditions/collections/types";
import { AfterTimeModule } from "../src/lib/unseal_conditions/modules/standard_modules/after_time_module";



describe("ChainedProofs", () => {
    var chainedProof: ChainedProofWrapper;
    var verifierContract: any;
    var verifierAddress: string;
    var addressMap: {[key: string]: string};
    before("should deploy ChainedProof contract", async () => {
        const verifier = await ethers.getContractFactory("TestVerifyAlwaysTrue");
        verifierContract = await verifier.deploy();
        verifierAddress = await verifierContract.getAddress();
        const public_proof_verifier = await verifierContract.getAddress();
        const forced_opening_verifier = await verifierContract.getAddress();
        const signer = (await ethers.provider.getSigner()) as unknown as Signer;
        chainedProof = new ChainedProofWrapper(signer as unknown as Provider);
        const chainedProofC = await ethers.getContractFactory("ChainedProof");
        var chainedProofContract = await chainedProofC.deploy(verifierAddress, verifierAddress);
        var chainedProofAddress = await chainedProofContract.getAddress();
        console.log(chainedProofAddress);
        await chainedProof.attach(chainedProofAddress);
        addressMap = staticContracts.toAddressMap(staticContracts.NETWORK_IDS.GENANCHE);
        //expect(chainedProof).to.be.an("object");
    });

    it("should compile a module", async () => {
        // const module = new DefaultAnchoredOpeningProofModule(ProofLibrary);
        // const compiledModule = module.compile("test_node_id", addressMap, {}, 0);
        // console.log(compiledModule);

        // const module2 = new AfterTimeModule(ProofLibrary);
        // const compiledModule2 = module2.compile("test_node_id", addressMap, {
        //     "timestamp": {output_proof_index: 0, output_signal_indexes: [0, 1]}}, 0);
        // console.log(compiledModule2);
       // assert.equal(compiledModule.actions.length, 1);
    });

    it("should compile a collection", async () => {
        const changedCallback = (changes: {action: ChangedType, nodes?: CollectionNode[], edges?: CollectionEdge[], starting_node?: CollectionNode|undefined}) => {
            console.log(changes);
        }
        const collection = new UnsealConditionCollection("Test", "Test", ProofLibrary, StandardModuleLibrary, changedCallback);
        const openingModule = new DefaultAnchoredOpeningProofModule(ProofLibrary);
        const afterTimeModule = new AfterTimeModule(ProofLibrary);
        const openingNodeId = collection.add_node(openingModule);
        const afterTimeNodeId = collection.add_node(afterTimeModule);
        collection.add_edge(openingNodeId, afterTimeNodeId, ["timestamp", "timestamp"], 
            CollectionEdgeInput.signal_pass);
        const compiledCollection = collection.compile(addressMap);
        console.log(compiledCollection);
    });
    it("should hash equilivantly", async () => {
        const chainedProofLocal = new ChainedProof("0x1234", "0x4567", ethers.provider);
        var state = chainedProofLocal.dryrun_start_proving(await verifierContract.getAddress(), ["0x1234", "0x4567"], "0x7890");
        var scstate = await chainedProof.dryrunStartProving(
            await verifierContract.getAddress(),
            [ethers.zeroPadValue("0x1234", 32), ethers.zeroPadValue("0x4567", 32)],
            ethers.zeroPadValue("0x7890", 32),
            false
        );

        
        assert.equal(state.current_hash, scstate.current_hash);

        state = await chainedProofLocal.dryrun_prepare_next_proof(state, verifierAddress,["0x1234", "0x4567"], "0x7890");
        scstate = await chainedProof.dryrunPrepareNextProof(scstate, verifierAddress,
            [ethers.zeroPadValue("0x1234", 32), ethers.zeroPadValue("0x4567", 32)], 
            ethers.zeroPadValue("0x7890", 32));
        assert.equal(state.current_hash, scstate.current_hash);
        
        state = chainedProofLocal.dryrun_chain_static_input(state, [ethers.zeroPadValue("0x1234", 32), ethers.zeroPadValue("0x4567", 32)], [0, 1]);

        scstate = await chainedProof.dryrunChainStaticInput(scstate, 
            [ethers.zeroPadValue("0x1234", 32), ethers.zeroPadValue("0x4567", 32)], 
            [0, 1]);
        assert.equal(state.current_hash, scstate.current_hash);

        state = await chainedProofLocal.dryrun_chain_proof_verify(state, true);
        scstate = await chainedProof.dryrunChainProofVerify(scstate, true);
        assert.equal(state.current_hash, scstate.current_hash);

        state = await chainedProofLocal.dryrun_prepare_next_proof(state, verifierAddress,["0x1234", "0x4567"], "0x7890");
        scstate = await chainedProof.dryrunPrepareNextProof(scstate, verifierAddress,
            [ethers.zeroPadValue("0x1234", 32), ethers.zeroPadValue("0x4567", 32)], 
            ethers.zeroPadValue("0x7890", 32));
        assert.equal(state.current_hash, scstate.current_hash);

        state = chainedProofLocal.dryrun_chain_pass_signal(state, [0, 1], [0, 0], [0, 1], true);
        scstate = await chainedProof.dryrunChainPassSignal(scstate, [0, 1], [0, 0], [0, 1], true);
        assert.equal(state.current_hash, scstate.current_hash);


        state = await chainedProofLocal.dryrun_chain_proof_verify(state, false);
        scstate = await chainedProof.dryrunChainProofVerify(scstate, false);
        assert.equal(state.current_hash, scstate.current_hash);
    });
});