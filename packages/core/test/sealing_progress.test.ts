import { expect } from "chai";

import { NihiliumSealingClient } from "../src/lib/client/sealing_client";
import {
    ProcessorSealPhase,
    SealProgressEvent,
    SealProgressStage,
} from "../src/lib/client/types";

/**
 * Sealing runs one ZK proof per processor, so a k-of-n seal is k multi-second proofs; these events are
 * all a caller has to show for that time. The accounting is derived from the persisted per-processor
 * records rather than a counter, so it has to be right for a resume too — which is the case worth
 * pinning, since a resumed seal that reported 0/12 while skipping finished shares would look stuck.
 *
 * Chain-free: the emit points are exercised by the chain-backed sealing_client spec; this covers the
 * arithmetic and the listener contract.
 */
describe("sealing progress", () => {

    // Exposes the private emitter and lets a spec seed the persisted state directly.
    class TestSealing extends NihiliumSealingClient {
        static build(processorCount: number, threshold: number): TestSealing {
            const processors = Array.from({ length: processorCount }, (_, i) => ({ server_address: `0x${i}` }));
            return new (TestSealing as any)(processors, [], {}, threshold) as TestSealing;
        }
        seed(phases: ProcessorSealPhase[], extra: { fdt_seal?: any; seal?: any } = {}) {
            (this as any).state = {
                per_processor: phases.map((phase, i) => ({ processor_index: i, phase })),
                ...extra,
            };
        }
        emit(stage: SealProgressStage, extra: Partial<SealProgressEvent> = {}) {
            (this as any).emitProgress(stage, extra);
        }
    }

    function collect(client: TestSealing): SealProgressEvent[] {
        const events: SealProgressEvent[] = [];
        client.on((e) => events.push(e));
        return events;
    }

    it("counts a request and a proof per share, plus the expansion and the assembly", () => {
        const client = TestSealing.build(5, 3);
        client.seed(Array(5).fill(ProcessorSealPhase.Pending));
        const events = collect(client);

        client.emit(SealProgressStage.RequestingCommitment, { processor_index: 0 });

        expect(events[0].total).to.equal(12);       // 5 shares x 2 steps + expansion + assembly
        expect(events[0].completed).to.equal(0);
        expect(events[0].processor_count).to.equal(5);
        expect(events[0].processor_index).to.equal(0);
    });

    it("credits a paid-but-unproven share with one step, a sealed share with two", () => {
        const client = TestSealing.build(3, 2);
        client.seed([ProcessorSealPhase.Sealed, ProcessorSealPhase.Responded, ProcessorSealPhase.Pending]);
        const events = collect(client);

        client.emit(SealProgressStage.ProvingShare, { processor_index: 1 });

        expect(events[0].completed).to.equal(3);   // 2 (sealed) + 1 (paid, not yet proven)
        expect(events[0].total).to.equal(8);
    });

    it("reports the work a resume skips instead of restarting at zero", () => {
        // The case that matters: three of five shares survived the crash, so the bar must open at 6/12.
        const client = TestSealing.build(5, 3);
        client.seed([
            ProcessorSealPhase.Sealed, ProcessorSealPhase.Sealed, ProcessorSealPhase.Sealed,
            ProcessorSealPhase.Pending, ProcessorSealPhase.Pending,
        ]);
        const events = collect(client);

        client.emit(SealProgressStage.ShareSealed, { processor_index: 2 });

        expect(events[0].completed).to.equal(6);
    });

    it("counts the threshold package and the finished seal as the last two steps", () => {
        const client = TestSealing.build(3, 2);
        client.seed(Array(3).fill(ProcessorSealPhase.Sealed), { fdt_seal: {}, seal: {} });
        const events = collect(client);

        client.emit(SealProgressStage.Sealed);

        expect(events[0].completed).to.equal(8);
        expect(events[0].completed).to.equal(events[0].total);
    });

    it("carries the combination count on the expansion stage", () => {
        const client = TestSealing.build(5, 3);
        client.seed(Array(5).fill(ProcessorSealPhase.Sealed));
        const events = collect(client);

        // C(5,3) = 10 — what FDTEncrypt is about to iterate over.
        client.emit(SealProgressStage.ThresholdExpansion, { combinations: 10 });

        expect(events[0].stage).to.equal(SealProgressStage.ThresholdExpansion);
        expect(events[0].combinations).to.equal(10);
        expect(events[0].processor_index).to.be.undefined;
    });

    it("survives a listener that throws", () => {
        // Sealing is paid; a caller's broken progress handler must not cost them the seal.
        const client = TestSealing.build(2, 2);
        client.seed(Array(2).fill(ProcessorSealPhase.Pending));
        const seen: SealProgressEvent[] = [];
        client.on(() => { throw new Error("listener blew up"); });
        client.on((e) => seen.push(e));

        expect(() => client.emit(SealProgressStage.ProvingShare, { processor_index: 0 })).to.not.throw();
        expect(seen.length).to.equal(1);   // the second listener still ran
    });

    it("emits nothing before start_sealing has created any state", () => {
        const client = TestSealing.build(3, 2);
        const events = collect(client);

        client.emit(SealProgressStage.RequestingCommitment, { processor_index: 0 });

        expect(events[0].completed).to.equal(0);
        expect(events[0].total).to.equal(8);
    });
});
