//Tests that test hashing equilivance of actions.ts and the solidity contract using hardhat

import { assert, expect } from "chai";
import { ChainedProofV2 as ChainedProof } from "../src/lib/unseal_conditions/ChainedProofV2";
import { DefaultAnchoredOpeningProofModule } from "../src/lib/unseal_conditions/modules";
import {  StandardProofLibrary } from "../src/lib/unseal_conditions/proofs";
import { StandardModuleLibrary } from "../src/lib/unseal_conditions/modules";
import * as staticContracts from "../src/static_contracts";
import { ChainedProofWrapper } from "../src/lib/contract_wrappers/ChainedProofWrapper";
import { ethers } from "hardhat";
import { deployedProtocolContracts } from "../src/static_contracts";
import { UnsealConditionCollection } from "../src/lib/unseal_conditions/collections/UnsealConditionCollection";
import { ChangedType, CollectionNode, CollectionEdge, CollectionEdgeInput, AddressMap } from "../src/lib/unseal_conditions/collections/types";
import { AfterTimeModule } from "../src/lib/unseal_conditions/modules/standard_modules/after_time_module";
import { TimeDelayModule } from "../src/lib/unseal_conditions/modules/standard_modules/time_delay";
import { MerkleTreeModule } from "../src/lib/unseal_conditions/modules/standard_modules/merkle_tree_module";
//import { DefaultAnchoredOpeningProofModuleList } from "../src/lib/unseal_conditions/modules/standard_modules/default_anchored_opening_module_2";



describe("ChainedProofs", () => {
    var chainedProof: ChainedProofWrapper;
    var verifierContract: any;
    var verifierAddress: string;
    var addressMap: AddressMap;
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
        collection.add_edge(openingNodeId, timeDelayNodeId, ["timestamp", "timestamp"],
            CollectionEdgeInput.signal_pass);
        collection.add_edge(openingNodeId, timeDelayNodeId, ["timestamp", "timestamp"],
            CollectionEdgeInput.signal_pass);
        collection.add_edge(openingNodeId, timeDelayNodeId, ["top_level_merkle_root", "top_level_merkle_root"],
                CollectionEdgeInput.signal_pass);
        collection.add_edge(undefined, timeDelayNodeId, ["delay", "delay"],
                CollectionEdgeInput.user_input);
        collection.add_data_stream("test_data_stream", openingNodeId, "metadata_root_hash");
        const compiledTemplate = collection.createTemplate(addressMap);
        compiledTemplate.compile({
            "threshold": 1234567890n,
            "delay": 1234567890n,
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

    it("should compile and run collection with forks", async () => {
        const changedCallback = (changes: { action: ChangedType, nodes?: CollectionNode[], edges?: CollectionEdge[], starting_node?: CollectionNode | undefined }) => {
            console.log(changes);
        }
        const collection = new UnsealConditionCollection("Test", "Test", new StandardProofLibrary(), new StandardModuleLibrary(), changedCallback);
        const openingModule = new DefaultAnchoredOpeningProofModule(new StandardProofLibrary());
        const afterTimeModule = new AfterTimeModule(new StandardProofLibrary());
        const timeDelayModuleRoot = new TimeDelayModule(new StandardProofLibrary());
        const timeDelayModuleFork1 = new TimeDelayModule(new StandardProofLibrary());
        const timeDelayModuleFork2 = new TimeDelayModule(new StandardProofLibrary());
        const subTreeModule = new MerkleTreeModule(new StandardProofLibrary());
        const oR = collection.add_node(openingModule);
        const r1 = collection.add_node(afterTimeModule);
        const r2 = collection.add_node(timeDelayModuleRoot);
        const f0 = collection.add_node(subTreeModule, r1);
        const f1 = collection.add_node(timeDelayModuleFork1, r1);
        const f2 = collection.add_node(timeDelayModuleFork2, r1);
        var edge_root1 =collection.add_edge(oR, r1, ["timestamp", "timestamp"],
            CollectionEdgeInput.signal_pass);
        var edge_root2 = collection.add_edge(oR, r2, ["timestamp", "timestamp"],
            CollectionEdgeInput.signal_pass);
        var edge_root3 = collection.add_edge(oR, r2, ["top_level_merkle_root", "top_level_merkle_root"],
                CollectionEdgeInput.signal_pass);
        
        var edge_root3 = collection.add_edge(oR, r2, ["timestamp", "timestamp"],
                CollectionEdgeInput.signal_pass);
        var edge_fork1 = collection.add_edge(oR, f1, ["timestamp", "timestamp"],
            CollectionEdgeInput.signal_pass);
        var edge_fork1 = collection.add_edge(f0, f1, ["leaf_index", "timestamp"],
                CollectionEdgeInput.signal_pass);
        var edge_fork2 = collection.add_edge(oR, f2, ["timestamp", "timestamp"],
            CollectionEdgeInput.signal_pass);
        var edge_fork3 = collection.add_edge(f0, f2, ["leaf_index", "timestamp"],
                CollectionEdgeInput.signal_pass);
        collection.add_edge(oR, f1, ["top_level_merkle_root", "top_level_merkle_root"],
                CollectionEdgeInput.signal_pass);
        collection.add_edge(oR, f2, ["top_level_merkle_root", "top_level_merkle_root"],
                    CollectionEdgeInput.signal_pass);
        collection.add_data_stream("test_data_stream", oR, "metadata_root_hash");
        var visual_forks = collection.visual_forks();
        var visual_edges_all = collection.visual_edges_all();
        console.log(visual_forks);
        console.log(visual_edges_all);
        const compiledTemplate = collection.createTemplate(addressMap);
        compiledTemplate.compile({
            "threshold": 10000000000n,
            "delay": 5000000000n,
            "metadata_root_hash": 9999999999n,
            "merkle_root": 9999999999n,
        }, {
            "test_data_stream": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
        });
        var unsealRoot = await compiledTemplate.getUnsealRoot();
        var compiledTemplateJson = compiledTemplate.export_compiled_to_json();
        assert.equal(compiledTemplate.getUnsealProofActions().length, 2);
        var removed_edges = collection.move_node(f2, "root", -1);
        console.log(removed_edges);
        var visual_forks2 = collection.visual_forks();
        var visual_edges_all2 = collection.visual_edges_all();


        var exported_json = collection.export_to_json();
        var imported_collection = new UnsealConditionCollection("Test", "Test", new StandardProofLibrary(), new StandardModuleLibrary(), changedCallback);
        imported_collection.import_from_json(exported_json);
        var visual_forks3 = collection.visual_forks();
        var visual_edges_all3 = imported_collection.visual_edges_all();
        assert.equal(visual_forks3.length, visual_forks2.length);
        assert.equal(visual_edges_all3.length, visual_edges_all2.length);
        for(var i = 0; i < visual_forks3.length; i++) {
            assert.equal(visual_forks3[i], visual_forks2[i]);
        }
        var countedForks = compiledTemplate.unsealProofActions[1]
             .filter(a => a.action == 'prepare_next_proof')
             .filter(b => b.params.verifier_must_be_true == false);
        //The fork should have at least one false evaluation in it.
        assert.equal(countedForks.length, 1);
        console.log(collection.visual_forks());
        console.log(compiledTemplate);
    });

    
});