/**
 * Published subpath exports, e.g. `@nihilium/client-sdk/scenarios/zkemail`.
 *
 * Each entry is emitted by scripts/emit-subpath-facades.mjs as a pair of one-line files
 * (dist/<subpath>.mjs and dist/<subpath>.d.ts) that re-export from the root bundle. They are facades,
 * not separate bundles, deliberately:
 *
 *  - one declaration. rollup-plugin-dts inlines every referenced type into each entry it builds, so a
 *    second entry would re-declare classes carrying private/protected members (UnsealConditionTemplate,
 *    NihiliumSealingClient). TypeScript compares those nominally, so a value obtained from the subpath
 *    would not be assignable to the same type obtained from the root.
 *  - one module instance. lib/endpoint-selection.ts holds `apiEndpoint` as module-level state; if the
 *    subpath resolved to a duplicated copy, setApiEndpoint() called through the root would not reach it.
 *
 * Adding a scenario is one entry here plus a barrel at `source`; package.json needs no edit (its
 * "./scenarios/*" export is a wildcard).
 *
 * CommonJS on purpose, in an otherwise ESM package: it is read both by scripts/emit-subpath-facades.mjs
 * (ESM, which can import CJS) and by the mocha specs (transpiled to CJS, which cannot require ESM).
 */
const SUBPATHS = [
    {
        /** Public path after the package name, and the path under dist/ the facade is written to. */
        subpath: "scenarios/zkemail",
        /**
         * Barrel this mirrors, relative to the package root.
         * test/subpath_facades.test.ts checks `values` against its real exports.
         */
        source: "src/scenarios/zkemail/index.ts",
        /** Runtime exports. A name that is both a value and a type (ZKEmailUnsealPhase) belongs here. */
        values: [
            "ZKEmailSealingClient",
            "ZKEmailUnsealingClient",
            "ZKEmailUnsealPhase",
            "ZKEmailRecoveryStatus",
            "hashEmailAddress",
            "checkEmailDomain",
            "domainOf",
            "domainVerdict",
        ],
        /** Type-only exports. Kept apart because the .mjs facade may only re-export real bindings. */
        types: [
            "ZKEmailSealingOptions",
            "ZKEmailUnsealingOptions",
            "ZKEmailDomainCheck",
            "ZKEmailDomainVerdict",
            "FetchLike",
        ],
    },
];

module.exports = { SUBPATHS };
