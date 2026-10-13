import { expect } from "chai";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

import {
    NihiliumPaymentProvider,
    NihiliumPaymentProviderClientAPIKEY_DO_NOT_USE,
    NihiliumPaymentProviderUnauthenticated,
    PROCESSOR_TOKEN_PATH,
    normalizeProcessorToken,
} from "../src/lib/client/payments";

const PROCESSOR = "0x" + "ab".repeat(20);
const REQUEST_ID = "0x" + "cd".repeat(32);

/** An unsigned JWT carrying the claim the backend puts in every processor token. */
function jwt(claims: Record<string, unknown>): string {
    const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${part({ alg: "EdDSA" })}.${part(claims)}.sig`;
}

interface Call { url: string; headers: Record<string, string>; body: unknown }

/** Replaces global fetch for one test; the providers take no injectable fetch. */
function stubFetch(status: number, body: unknown): { calls: Call[]; restore: () => void } {
    const original = globalThis.fetch;
    const calls: Call[] = [];
    globalThis.fetch = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
        calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
            text: async () => JSON.stringify(body),
        };
    }) as unknown as typeof fetch;
    return { calls, restore: () => { globalThis.fetch = original; } };
}

/** What the Nihilium backend's POST /api/request-processor-token actually answers. */
const BACKEND_BODY = { token: jwt({ amount_charged: "0.010000" }), expiresAt: "2026-10-14T00:00:00.000Z" };

describe("normalizeProcessorToken", () => {
    it("maps the backend's { token, expiresAt } to the PaymentProvider shape, charge read from the JWT", () => {
        expect(normalizeProcessorToken(BACKEND_BODY)).to.deep.equal({
            token: BACKEND_BODY.token,
            expires_at: "2026-10-14T00:00:00.000Z",
            amountCharged: "0.010000",
        });
    });

    it("passes the PaymentProvider shape through unchanged", () => {
        const body = { token: "t", expires_at: "e", amountCharged: "1" };
        expect(normalizeProcessorToken(body)).to.deep.equal(body);
    });

    it("reports an undecodable token's charge as unknown rather than failing", () => {
        expect(normalizeProcessorToken({ token: "opaque" }).amountCharged).to.equal("unknown");
    });

    it("refuses a response with no token", () => {
        expect(() => normalizeProcessorToken({ expiresAt: "x" })).to.throw(/no token/);
        expect(() => normalizeProcessorToken(undefined)).to.throw(/no token/);
    });
});

describe("NihiliumPaymentProvider", () => {
    it("posts { processorAddress, requestId } to the developer server's PROCESSOR_TOKEN_PATH", async () => {
        const { calls, restore } = stubFetch(200, BACKEND_BODY);
        try {
            const token = await new NihiliumPaymentProvider("https://dev.example").getProcessorToken(PROCESSOR, REQUEST_ID);
            expect(calls[0].url).to.equal(`https://dev.example${PROCESSOR_TOKEN_PATH}`);
            expect(calls[0].body).to.deep.equal({ processorAddress: PROCESSOR, requestId: REQUEST_ID });
            expect(token.amountCharged).to.equal("0.010000");
        } finally {
            restore();
        }
    });

    it("sends caller headers, read fresh for each token", async () => {
        const { calls, restore } = stubFetch(200, BACKEND_BODY);
        try {
            let n = 0;
            const provider = new NihiliumPaymentProvider("https://dev.example", {
                headers: async () => ({ Authorization: `Bearer session-${++n}` }),
            });
            await provider.getProcessorToken(PROCESSOR, REQUEST_ID);
            await provider.getProcessorToken(PROCESSOR, REQUEST_ID);
            expect(calls.map((c) => c.headers["Authorization"])).to.deep.equal(["Bearer session-1", "Bearer session-2"]);
            expect(calls[0].headers["Content-Type"]).to.equal("application/json");
        } finally {
            restore();
        }
    });

    it("does not let a caller header replace the content type", async () => {
        const { calls, restore } = stubFetch(200, BACKEND_BODY);
        try {
            await new NihiliumPaymentProvider("https://dev.example", { headers: { "Content-Type": "text/plain" } })
                .getProcessorToken(PROCESSOR, REQUEST_ID);
            expect(calls[0].headers["Content-Type"]).to.equal("application/json");
        } finally {
            restore();
        }
    });

    it("throws on a refusal", async () => {
        const { restore } = stubFetch(403, { error: "no" });
        try {
            await expect(new NihiliumPaymentProvider("https://dev.example").getProcessorToken(PROCESSOR, REQUEST_ID))
                .to.be.rejectedWith(/Payment proxy error 403/);
        } finally {
            restore();
        }
    });
});

describe("NihiliumPaymentProviderClientAPIKEY_DO_NOT_USE", () => {
    it("normalizes the backend's response instead of returning it raw", async () => {
        const { calls, restore } = stubFetch(200, BACKEND_BODY);
        try {
            const token = await new NihiliumPaymentProviderClientAPIKEY_DO_NOT_USE("https://api.example", "nih_k")
                .getProcessorToken(PROCESSOR, REQUEST_ID);
            expect(calls[0].url).to.equal(`https://api.example${PROCESSOR_TOKEN_PATH}`);
            expect(calls[0].headers["X-API-Key"]).to.equal("nih_k");
            expect(token.expires_at).to.equal("2026-10-14T00:00:00.000Z");
            expect(token.amountCharged).to.equal("0.010000");
        } finally {
            restore();
        }
    });
});

describe("NihiliumPaymentProviderUnauthenticated", () => {
    it("returns an empty token without any request", async () => {
        const { calls, restore } = stubFetch(200, BACKEND_BODY);
        try {
            const token = await new NihiliumPaymentProviderUnauthenticated().getProcessorToken(PROCESSOR, REQUEST_ID);
            expect(token).to.deep.equal({ token: "", expires_at: "", amountCharged: "0" });
            expect(calls).to.have.length(0);
        } finally {
            restore();
        }
    });
});
