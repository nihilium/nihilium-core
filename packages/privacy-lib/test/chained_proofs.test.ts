//Tests that test hashing equilivance of actions.ts and the solidity contract using hardhat

import { assert, expect } from "chai";
import { ChainedProof } from "../src/lib/unseal_conditions/ChainedProof";
import { DefaultAnchoredOpeningProofModule } from "../src/lib/unseal_conditions/modules";
import {  StandardProofLibrary } from "../src/lib/unseal_conditions/proofs";
import { StandardModuleLibrary } from "../src/lib/unseal_conditions/modules";
import * as staticContracts from "../src/static_contracts";
import { ChainedProofWrapper } from "../src/lib/contract_wrappers/ChainedProofWrapper";
import { ethers } from "hardhat";
import { deployedProtocolContracts } from "../src/static_contracts";
import { UnsealConditionCollection } from "../src/lib/unseal_conditions/collections/UnsealConditionCollection";
import { ChangedType, CollectionNode, CollectionEdge, CollectionEdgeInput } from "../src/lib/unseal_conditions/collections/types";
import { AfterTimeModule } from "../src/lib/unseal_conditions/modules/standard_modules/after_time_module";
import { TimeDelayModule } from "../src/lib/unseal_conditions/modules/standard_modules/time_delay";
//import { DefaultAnchoredOpeningProofModuleList } from "../src/lib/unseal_conditions/modules/standard_modules/default_anchored_opening_module_2";



describe("ChainedProofs", () => {
    var chainedProof: ChainedProofWrapper;
    var verifierContract: any;
    var verifierAddress: string;
    var addressMap: { [key: string]: string };
    before("should deploy ChainedProof contract", async () => {
        const verifier = await ethers.getContractFactory("TestVerifyAlwaysTrue");
        verifierContract = await verifier.deploy();
        verifierAddress = await verifierContract.getAddress();
        const public_proof_verifier = await verifierContract.getAddress();
        const forced_opening_verifier = await verifierContract.getAddress();
        const signer = await ethers.provider.getSigner();
        chainedProof = new ChainedProofWrapper(ethers.provider, signer);
        const chainedProofC = await ethers.getContractFactory("ChainedProof");
        var chainedProofContract = await chainedProofC.deploy(verifierAddress, verifierAddress);
        var chainedProofAddress = await chainedProofContract.getAddress();
        console.log(chainedProofAddress);
        await chainedProof.attach(chainedProofAddress);

        addressMap = staticContracts.toAddressMap(staticContracts.NETWORK_IDS.ANVIL);
        //expect(chainedProof).to.be.an("object");
    });

    it("should compile a module", async () => {
        const proofLibrary = new StandardProofLibrary();
        const module = new DefaultAnchoredOpeningProofModule(proofLibrary);
        //const moduleList = new DefaultAnchoredOpeningProofModuleList(proofLibrary);
        const compiledModule = module.compile("test_node_id", addressMap, {}, 0);
        //const compiledModuleList = moduleList.compile("test_node_id", addressMap, {}, 0);
        console.log(compiledModule);
        //console.log(compiledModuleList);
        // for (var i = 0; i < compiledModule.actions.length; i++) {
        //     assert.equal(compiledModule.actions[i].action, compiledModuleList.actions[i].action);
        //     assert.deepEqual(compiledModule.actions[i].params, compiledModuleList.actions[i].params);
        // }

        const module2 = new AfterTimeModule(proofLibrary);
        const compiledModule2 = module2.compile("test_node_id", addressMap, {
            "timestamp": {output_proof_index: 0, output_signal_indexes: [0, 1]}}, 0);
        console.log(compiledModule2);
        assert.equal(compiledModule.actions.length, 12);
    });

    it("should compile and run collection", async () => {
        const changedCallback = (changes: { action: ChangedType, nodes?: CollectionNode[], edges?: CollectionEdge[], starting_node?: CollectionNode | undefined }) => {
            console.log(changes);
        }
        const collection = new UnsealConditionCollection("Test", "Test", new StandardProofLibrary(), new StandardModuleLibrary(), changedCallback);
        const openingModule = new DefaultAnchoredOpeningProofModule(new StandardProofLibrary());
        const afterTimeModule = new AfterTimeModule(new StandardProofLibrary());
        const timeDelayModule = new TimeDelayModule(new StandardProofLibrary());
      
        const openingNodeId = collection.add_node(openingModule);
        const afterTimeNodeId = collection.add_node(afterTimeModule);
        const timeDelayNodeId = collection.add_node(timeDelayModule);
        collection.add_edge(openingNodeId, afterTimeNodeId, ["timestamp", "timestamp"],
            CollectionEdgeInput.signal_pass);
        collection.add_edge(openingNodeId, timeDelayNodeId, ["timestamp", "timestamp_low"],
            CollectionEdgeInput.signal_pass);
        collection.add_edge(openingNodeId, timeDelayNodeId, ["timestamp", "timestamp_high"],
            CollectionEdgeInput.signal_pass);
        collection.add_edge(undefined, timeDelayNodeId, ["offset", "offset"],
                CollectionEdgeInput.user_input);
        collection.add_data_stream("test_data_stream", openingNodeId, "metadata_root_hash");
        const compiledTemplate = collection.createTemplate(addressMap);
        compiledTemplate.compile({
            "threshold": 1234567890n,
            "offset": 1234567890n,
            "metadata_root_hash": 1234567890n,
        }, {
            "test_data_stream": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
        });
        var unsealRoot = await compiledTemplate.getUnsealRoot();
        var compiledTemplateJson = compiledTemplate.export_compiled_to_json();
        console.log(compiledTemplate);
    });
    it("should hash equilivantly", async () => {
        const chainedProofLocal = new ChainedProof("0x1234", "0x4567", ethers.provider);
        var state = {
            current_hash:
                ethers.ZeroHash,  // Use zero hash instead of empty string
            current_index: 0,
            outputs: [],
            prepared_public_inputs: [],
            prepared_proof: "0x",  // Use "0x" for empty bytes instead of ""
            proof_verifier: ethers.ZeroAddress,
            initiator: ethers.ZeroAddress,
            verifier_must_be_true: false,
        };
        var scstate = Object.assign({}, state);


        assert.equal(state.current_hash, scstate.current_hash);

        state = await ChainedProof.dryrun_prepare_next_proof(state, verifierAddress, true, ["0x1234", "0x4567"], "0x7890");
        scstate = await chainedProof.dryrunPrepareNextProof(scstate, verifierAddress, true,
            [ethers.zeroPadValue("0x1234", 32), ethers.zeroPadValue("0x4567", 32)],
            ethers.zeroPadValue("0x7890", 32));
        assert.equal(state.current_hash, scstate.current_hash);

        state = ChainedProof.dryrun_chain_static_input(state, BigInt(ethers.zeroPadValue("0x1234", 32)), 0);

        scstate = await chainedProof.dryrunChainStaticInput(scstate,
            BigInt(ethers.zeroPadValue("0x1234", 32)), 0);
        assert.equal(state.current_hash, scstate.current_hash);

        state = await ChainedProof.dryrun_chain_proof_verify(state, true);
        scstate = await chainedProof.dryrunChainProofVerify(scstate, true);
        assert.equal(state.current_hash, scstate.current_hash);

        state = await ChainedProof.dryrun_prepare_next_proof(state, verifierAddress, true, ["0x1234", "0x4567"], "0x7890");
        scstate = await chainedProof.dryrunPrepareNextProof(scstate, verifierAddress, true,
            [ethers.zeroPadValue("0x1234", 32), ethers.zeroPadValue("0x4567", 32)],
            ethers.zeroPadValue("0x7890", 32));
        assert.equal(state.current_hash, scstate.current_hash);

        state = ChainedProof.dryrun_chain_pass_signal(state, [0, 1], 0, [0, 1], true);
        scstate = await chainedProof.dryrunChainPassSignal(scstate, [0, 1], 0, [0, 1], true);
        assert.equal(state.current_hash, scstate.current_hash);


        state = await ChainedProof.dryrun_chain_proof_verify(state, false);
        scstate = await chainedProof.dryrunChainProofVerify(scstate, false);
        assert.equal(state.current_hash, scstate.current_hash);
    });
});