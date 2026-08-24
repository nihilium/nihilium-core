import { expect } from "chai";

// @ts-ignore -- plain CJS manifest shared with the build script; it ships no declarations.
import { SUBPATHS } from "../subpaths.cjs";
import * as root from "../src/index";
import * as zkemailBarrel from "../src/scenarios/zkemail";

// The published subpaths (`@nihilium/client-sdk/scenarios/zkemail`) are generated from subpaths.cjs,
// not from the barrel itself, so a name added to a scenario without being added to the manifest would
// silently be missing from the subpath while still working through the package root. This pins the two
// together. Type-only exports are erased at runtime and cannot be checked here -- a wrong name there
// surfaces as a compile error in any consumer importing through the subpath.
describe("subpath facades", () => {
    // One line per scenario, keyed by the manifest's `source`.
    const BARRELS: Record<string, Record<string, unknown>> = {
        "src/scenarios/zkemail/index.ts": zkemailBarrel,
    };

    it("lists exactly the runtime exports of each scenario barrel", () => {
        expect(SUBPATHS.length).to.be.greaterThan(0);

        for (const entry of SUBPATHS) {
            const barrel = BARRELS[entry.source];
            expect(barrel, `no barrel registered in this test for "${entry.source}"`).to.exist;
            expect(Object.keys(barrel).sort(), `manifest values for "${entry.subpath}"`)
                .to.deep.equal([...entry.values].sort());
        }
    });

    it("keeps every subpath reachable through the package root", () => {
        // The facade re-exports from ../index, so a name missing at the root is a broken subpath.
        for (const entry of SUBPATHS) {
            for (const name of entry.values) {
                expect(root, `root export "${name}" for "${entry.subpath}"`).to.have.property(name);
            }
        }
    });
});
