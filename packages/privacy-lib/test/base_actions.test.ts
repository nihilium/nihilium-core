//Tests that test hashing equilivance of actions.ts and the solidity contract using hardhat

import { assert, expect } from "chai";
import { ChainedProof, ProvingState } from "../src/lib/reveal_methods/base_functions/ChainedProof";
import { ChainedProofWrapper } from "../src/lib/contract_wrappers/ChainedProofWrapper";
import { ethers } from "hardhat";
import { Provider, Signer } from "ethers";



describe("ChainedProof", () => {
    var chainedProof: ChainedProofWrapper;
    var verifierContract: any;
    var verifierAddress: string;
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
        //expect(chainedProof).to.be.an("object");
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

        
        state = chainedProofLocal.dryrun_validate_timestamp(state, 0, 0, 0, 1000);
        scstate = await chainedProof.dryrunValidateTimestamp(scstate, 0, 0, 0, 1000);
        assert.equal(state.current_hash, scstate.current_hash);

        state = await chainedProofLocal.dryrun_chain_proof_verify(state, false);
        scstate = await chainedProof.dryrunChainProofVerify(scstate, false);
        assert.equal(state.current_hash, scstate.current_hash);
    });
});