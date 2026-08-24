import { expect } from "chai";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

import { checkEmailDomain, domainOf, domainVerdict } from "../src/scenarios/zkemail/email_domain";

// The registry check is what tells a caller, before sealing, whether an address can ever be recovered
// through ZKEmail. Getting the request wrong (sending the whole address, or the wrong path) is not
// something a later step would catch.
describe("ZKEmail domain check", () => {
    function fakeRegistry(body: any = { domain: "example.com", known: true, shouldSendEmail: false, unsupported: false }) {
        const urls: string[] = [];
        const fetchFn = async (url: string) => {
            urls.push(url);
            return { json: async () => body };
        };
        return { urls, fetchFn };
    }

    describe("domainOf", () => {
        it("keeps only the domain half, normalized", () => {
            expect(domainOf("User@Example.COM ")).to.equal("example.com");
            expect(domainOf("example.com")).to.equal("example.com");
            // A '+' tag or a quoted local part can itself contain '@' — the last one wins.
            expect(domainOf("\"odd@local\"@example.com")).to.equal("example.com");
        });

        it("rejects input with no domain", () => {
            expect(() => domainOf("user@")).to.throw(/no email domain/);
            expect(() => domainOf("   ")).to.throw(/no email domain/);
        });
    });

    it("asks the registry about the domain only, never the full address", () => {
        const svc = fakeRegistry();
        return checkEmailDomain("https://email.test/", "user@example.com", svc.fetchFn).then(() => {
            expect(svc.urls).to.deep.equal(["https://email.test/v1/registry/check?domain=example.com"]);
            expect(svc.urls[0]).to.not.contain("user");
        });
    });

    it("url-encodes the domain", async () => {
        const svc = fakeRegistry({ domain: "exämple.com", unsupported: false });
        await checkEmailDomain("https://email.test", "user@exämple.com", svc.fetchFn);
        expect(svc.urls[0]).to.equal("https://email.test/v1/registry/check?domain=ex%C3%A4mple.com");
    });

    it("returns the service's answer, defaulting the flags it omits", async () => {
        const svc = fakeRegistry({ domain: "example.com", known: true, shouldSendEmail: true, unsupported: false });
        expect(await checkEmailDomain("https://email.test", "user@example.com", svc.fetchFn)).to.deep.equal({
            domain: "example.com", known: true, shouldSendEmail: true, unsupported: false,
        });

        const sparse = fakeRegistry({ unsupported: true });
        expect(await checkEmailDomain("https://email.test", "user@nope.test", sparse.fetchFn)).to.deep.equal({
            domain: "nope.test", known: false, shouldSendEmail: false, unsupported: true,
        });
    });

    describe("domainVerdict", () => {
        const answer = (flags: Partial<{ known: boolean; shouldSendEmail: boolean; unsupported: boolean }>) =>
            ({ domain: "example.com", known: false, shouldSendEmail: false, unsupported: false, ...flags });

        it("only calls a domain eligible when the registry actually holds a key for it", () => {
            expect(domainVerdict(answer({ known: true }))).to.equal("eligible");
        });

        it("treats an all-false answer as unverified, not as approval", () => {
            // The registry found no DKIM record. Read as "eligible" this would let someone seal against
            // an address whose recovery is a guess — and the guess is only tested at recovery time.
            expect(domainVerdict(answer({}))).to.equal("unverified");
        });

        it("asks for registration when the service wants an email, known or not", () => {
            expect(domainVerdict(answer({ shouldSendEmail: true }))).to.equal("needs_registration");
            expect(domainVerdict(answer({ known: true, shouldSendEmail: true }))).to.equal("needs_registration");
        });

        it("lets unsupported outrank every other flag", () => {
            expect(domainVerdict(answer({ unsupported: true }))).to.equal("unsupported");
            expect(domainVerdict(answer({ known: true, shouldSendEmail: true, unsupported: true })))
                .to.equal("unsupported");
        });
    });

    it("throws when the service does not answer the check", async () => {
        // An error page or a 404 body would otherwise read as "supported" and be sealed against.
        const svc = fakeRegistry({ error: "not found" });
        await expect(checkEmailDomain("https://email.test", "user@example.com", svc.fetchFn))
            .to.be.rejectedWith(/did not answer the domain check/);
    });
});
