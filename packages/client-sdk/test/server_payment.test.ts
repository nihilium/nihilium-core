import { expect } from "chai";

import { NihiliumServerPayment } from "../src/server";
import { NihiliumPaymentProvider, PROCESSOR_TOKEN_PATH } from "@nihilium/core";

const PROCESSOR = "0x" + "ab".repeat(20);
const REQUEST_ID = "0x" + "cd".repeat(32);

interface Call { url: string; headers: Record<string, string>; body: unknown }

/**
 * NihiliumServerPayment used to call `/api/get-processor-token` with `{ processorId }`. The backend
 * has no such route and requires `processorAddress`, so every call failed. This pins it to the
 * backend's actual contract.
 */
describe("NihiliumServerPayment", () => {
    let calls: Call[];
    let original: typeof fetch;

    beforeEach(() => {
        original = globalThis.fetch;
        calls = [];
        globalThis.fetch = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
            calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
            // The backend's real response shape: `expiresAt`, and no charge field.
            return { ok: true, status: 200, json: async () => ({ token: "a.eyJhbW91bnRfY2hhcmdlZCI6IjAuMDEifQ.c", expiresAt: "later" }), text: async () => "" };
        }) as unknown as typeof fetch;
    });
    afterEach(() => {
        globalThis.fetch = original;
    });

    it("calls the backend's route with processorAddress and the API key", async () => {
        await new NihiliumServerPayment("https://api.nihilium.io", "nih_k").getProcessorToken(PROCESSOR, REQUEST_ID);
        expect(calls[0].url).to.equal("https://api.nihilium.io/api/request-processor-token");
        expect(calls[0].headers["X-API-Key"]).to.equal("nih_k");
        expect(calls[0].body).to.deep.equal({ processorAddress: PROCESSOR, requestId: REQUEST_ID });
    });

    it("returns a ProcessorToken object, not the raw backend body", async () => {
        const token = await new NihiliumServerPayment("https://api.nihilium.io", "nih_k").getProcessorToken(PROCESSOR, REQUEST_ID);
        expect(token).to.deep.equal({ token: "a.eyJhbW91bnRfY2hhcmdlZCI6IjAuMDEifQ.c", expires_at: "later", amountCharged: "0.01" });
    });

    it("serves the same path the browser provider calls", async () => {
        await new NihiliumPaymentProvider("https://dev.example").getProcessorToken(PROCESSOR, REQUEST_ID);
        await new NihiliumServerPayment("https://api.nihilium.io", "nih_k").getProcessorToken(PROCESSOR, REQUEST_ID);
        expect(new URL(calls[0].url).pathname).to.equal(PROCESSOR_TOKEN_PATH);
        expect(new URL(calls[1].url).pathname).to.equal(PROCESSOR_TOKEN_PATH);
    });
});
