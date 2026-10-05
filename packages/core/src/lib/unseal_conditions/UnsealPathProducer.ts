import {
    CompiledModule,
    ModuleProof,
    ProofProductionContext,
    UnsealConditionModule,
} from "./modules";
import { UnsealConditionTemplate } from "./collections/UnsealConditionTemplate";

/**
 * Supplies a module's external inputs (the app-owned, irreducible parts such as a ZKEmail
 * proof) during unseal proof production. Keyed by CompiledModule.module_id (with module_name
 * as a fallback) so it works with modules the SDK does not know at compile time.
 */
export type UnsealResolver = (
    module: UnsealConditionModule,
    compiled_module: CompiledModule,
) => Promise<{ [key: string]: any }> | { [key: string]: any };

export type UnsealResolvers = { [moduleIdOrName: string]: UnsealResolver };

/** Lifecycle phase of a module during unseal proof production, emitted via on(). */
export enum UnsealModulePhase {
    Producing = "producing",
    Produced = "produced",
    Failed = "failed",
}

export type UnsealModuleEvent = {
    proof_index: number;
    module_id: string;
    module_name: string;
    phase: UnsealModulePhase;
    error?: unknown;
};

/** Error thrown by the producer, tagged with the module that failed. */
export class UnsealModuleError extends Error {
    constructor(public module_id: string, public module_name: string, message: string) {
        super(`Module ${module_name} (${module_id}): ${message}`);
        this.name = "UnsealModuleError";
    }
}

/**
 * Produces the proofs for one unseal path (fork) of a compiled UnsealConditionTemplate. This is the
 * relocated home of what used to be ClientSingleShareUnsealingProcess.runPath — producing proofs is a
 * function of the unseal conditions/template, not of a single processor's request. The unsealing client
 * drives it: shared modules once, per-processor modules per processor (see perProcessorModuleIds).
 *
 * Transport-agnostic: it only produces the ordered {proofs, public_inputs} for a path; the caller feeds
 * those to a single-share process's get_unseal_request / unseal_request_to_processor.
 */
export class UnsealPathProducer {

    private template: UnsealConditionTemplate;
    private moduleListeners: ((event: UnsealModuleEvent) => void)[] = [];

    constructor(template: UnsealConditionTemplate) {
        if (!template.isCompiled()) {
            throw new Error("Cannot produce proofs for an uncompiled unseal condition template");
        }
        this.template = template;
    }

    /** The ordered {compiled_module, module} pairs for a fork/path, in template order. */
    modulesForPath(proof_index: number): { compiled_module: CompiledModule; module: UnsealConditionModule }[] {
        const toReturn: { compiled_module: CompiledModule; module: UnsealConditionModule }[] = [];
        for (const compiled_module of this.template.compiled_collection.compiled_modules[proof_index]) {
            toReturn.push({
                compiled_module,
                module: this.template.module_library.getModule(
                    compiled_module.module_name, this.template.proof_library,
                ),
            });
        }
        return toReturn;
    }

    /** Enumerate the unseal paths (forks) this template exposes; pick one by index for produce(). */
    paths(): { index: number }[] {
        return this.template.compiled_collection.compiled_modules.map(
            (_: unknown, index: number) => ({ index }),
        );
    }

    /** Subscribe to per-module lifecycle events (structured progress). */
    on(listener: (event: UnsealModuleEvent) => void): void {
        this.moduleListeners.push(listener);
    }

    private emitModule(event: UnsealModuleEvent): void {
        for (const listener of this.moduleListeners) {
            try { listener(event); } catch { /* listener errors must not break production */ }
        }
    }

    /**
     * The module ids of a path whose produced proof is per-processor — i.e. must be produced separately
     * for every processor because it binds per-processor data (the anchored opening proof's reveal_value,
     * and anything derived from it). Seeded from each module's requires_unique_proof_per_processor flag;
     * the produce() upstream guard is the sound backstop that refuses to share a module which reads a
     * per-processor upstream output at production time. Modules not in this set are produced once and
     * reused across all processors.
     */
    perProcessorModuleIds(proof_index: number): Set<string> {
        const ids = new Set<string>();
        // modulesForPath is in template order, which is topological: a module's upstreams are always
        // classified before it, so one forward pass is enough.
        const seen = new Map<string, UnsealConditionModule>();

        for (const { compiled_module, module } of this.modulesForPath(proof_index)) {
            const module_id = compiled_module.module_id;
            seen.set(module_id, module);

            let perProcessor = module.requires_unique_proof_per_processor;
            if (!perProcessor) {
                for (const input_name of this.boundInputNames(module)) {
                    const edge = this.bindingEdge(module_id, input_name);
                    if (!edge) continue;
                    if (this.outputIsPerProcessor(ids, seen, edge.from_node_id, edge.mapping[0])) {
                        perProcessor = true;
                        break;
                    }
                }
            }
            if (perProcessor) ids.add(module_id);
        }
        return ids;
    }

    /**
     * This module's inputs the chain substitutes into, i.e. the ones a binding can feed.
     *
     * Optional-called: a module library may hand back anything that can produce, and a module that
     * declares no inputs simply has no bindings to resolve.
     */
    private boundInputNames(module: UnsealConditionModule): string[] {
        return Object.entries(module.getUserInputs?.() ?? {})
            .filter(([, input]) => (input as { user_input?: boolean })?.user_input === false)
            .map(([name]) => name);
    }

    /** The collection edge feeding `input_name` of `module_id`, if the graph makes one. */
    private bindingEdge(module_id: string, input_name: string): any | undefined {
        const edges = this.template.compiled_collection?.collection_export?.edges;
        if (!Array.isArray(edges)) return undefined;
        return edges.find((edge: any) =>
            edge?.to_node_id === module_id && edge?.mapping?.[1] === input_name);
    }

    /**
     * Whether one named output of an already-classified module carries a value that differs per
     * processor.
     *
     * Per output rather than per module, and that distinction is the whole point. A module produced
     * once for every processor can still expose an output that is identical across all of them --
     * the opening module's metadata_root_hash is one value chosen for the seal, and HashTieModule's
     * tied_hash is poseidon1 of one preimage chosen per recovery. Classifying by module alone would
     * mark every consumer of those per-processor, which would turn zkEmail's single shared proof
     * into k.
     */
    private outputIsPerProcessor(
        perProcessorIds: Set<string>,
        modules: Map<string, UnsealConditionModule>,
        from_node_id: string,
        output_name: string,
    ): boolean {
        if (!perProcessorIds.has(from_node_id)) return false;
        const declared = modules.get(from_node_id)?.getOutputs?.()?.[output_name];
        return declared?.per_processor !== false;
    }

    /**
     * Produce every proof for one path, in template order, and return the assembled proofs/public_inputs
     * (positionally aligned with template.unsealProofActions[proof_index]).
     *
     * `memo` is read AND written: a module already present is reused (its proof is not regenerated); every
     * produced module is written back. The caller controls what carries across processors — it seeds `memo`
     * with the shared cache (and any caller-preselected proofs) and, after the call, harvests back only the
     * shared modules (perProcessorModuleIds complement). Modules that declare productionInputs() require a
     * resolver (keyed by module_id, module_name fallback); context-only modules run with no resolver.
     */
    async produce(
        proof_index: number,
        ctx: ProofProductionContext,
        resolvers: UnsealResolvers = {},
        memo: { [module_id: string]: ModuleProof } = {},
    ): Promise<{ proofs: any[]; public_inputs: any[][] }> {
        const modules = this.modulesForPath(proof_index);
        const perProcessor = this.perProcessorModuleIds(proof_index);
        const proofs: any[] = [];
        const public_inputs: any[][] = [];

        for (const { compiled_module, module } of modules) {
            const module_id = compiled_module.module_id;
            const module_name = compiled_module.module_name;

            let result = memo[module_id];
            if (!result) {
                const requiredInputs = Object.keys(module.productionInputs());
                const resolver = resolvers[module_id] ?? resolvers[module_name];
                if (requiredInputs.length > 0 && !resolver) {
                    throw new UnsealModuleError(module_id, module_name,
                        `requires external inputs (${requiredInputs.join(", ")}) but no resolver was provided`);
                }
                const inputs = resolver ? await resolver(module, compiled_module) : {};
                const bound_inputs = this.resolveBindings(
                    proof_index, compiled_module, module, ctx.upstream, perProcessor);
                const produceCtx = { ...this.guardUpstream(ctx, module_id, perProcessor), bound_inputs };
                this.emitModule({ proof_index, module_id, module_name, phase: UnsealModulePhase.Producing });
                try {
                    result = await module.produce(produceCtx, inputs);
                } catch (error) {
                    this.emitModule({ proof_index, module_id, module_name, phase: UnsealModulePhase.Failed, error });
                    if (error instanceof UnsealModuleError) throw error;
                    throw new UnsealModuleError(module_id, module_name,
                        error instanceof Error ? error.message : String(error));
                }
                memo[module_id] = result;
                this.emitModule({ proof_index, module_id, module_name, phase: UnsealModulePhase.Produced });
            }

            ctx.upstream[module_id] = result;
            proofs.push(...result.proofs);
            public_inputs.push(...result.public_inputs);
        }

        return { proofs, public_inputs };
    }

    /**
     * The values the chain will substitute into this module's `user_input: false` inputs at verify
     * time, keyed by the module's own input name.
     *
     * A module declares such an input and the collection binds it to an upstream module's output;
     * the verifier then overwrites that public-input slot with the upstream value before checking
     * the proof (see ChainedProof.dryrun_chain_pass_signal). A module that proves over a different
     * value produces a proof that cannot verify -- which is exactly what happened when HashTieModule
     * ignored its declared `tied_value` and always tied to the seal's reveal_value: correct for the
     * one collection that binds `reveal_value -> tied_value`, and silently wrong for any other.
     *
     * Resolved here rather than in the module because a module knows it has an input called
     * `tied_value`; it has no way to learn that `UnsealOpeningModule_0.metadata_root_hash` is what
     * feeds it. That is a property of the graph, and the graph is what this class holds.
     *
     * A binding is omitted -- not an error -- when the upstream module has not produced, when it
     * emits no outputs, or when this module is shared while the value would come from a
     * per-processor one. The last is the same unsoundness `guardUpstream` refuses: a single shared
     * proof must not bind one processor's data. Modules read the result as
     * `ctx.bound_inputs?.<name> ?? <their own default>`, so an omitted binding is the behaviour
     * they had before this existed.
     *
     * Public, like perProcessorModuleIds, because it answers a question about the graph rather than
     * about a run: "what will the verifier substitute here?" is worth asserting in a test, and a
     * downstream SDK pinning this fork needs to be able to ask it.
     */
    resolveBindings(
        proof_index: number,
        compiled_module: CompiledModule,
        module: UnsealConditionModule,
        upstream: { [module_id: string]: ModuleProof },
        perProcessor: Set<string>,
    ): { [input_name: string]: any } {
        const consumerIsShared = !perProcessor.has(compiled_module.module_id);
        const modules = consumerIsShared ? this.modulesById(proof_index) : undefined;
        const bound: { [input_name: string]: any } = {};

        // user_input inputs are supplied at seal time and compiled into the template; only the
        // chain-substituted ones can disagree with what the module proves over.
        for (const input_name of this.boundInputNames(module)) {
            const edge = this.bindingEdge(compiled_module.module_id, input_name);
            if (!edge) continue;
            if (modules
                && this.outputIsPerProcessor(
                    perProcessor, modules, edge.from_node_id, edge.mapping[0])) continue;

            const value = upstream[edge.from_node_id]?.outputs?.[edge.mapping[0]];
            if (value !== undefined) bound[input_name] = value;
        }
        return bound;
    }

    /** Every module on a path by id, for resolving an upstream output's declaration. */
    private modulesById(proof_index: number): Map<string, UnsealConditionModule> {
        const map = new Map<string, UnsealConditionModule>();
        for (const { compiled_module, module } of this.modulesForPath(proof_index)) {
            map.set(compiled_module.module_id, module);
        }
        return map;
    }

    /**
     * Soundness backstop for the "produce once, share across processors" optimization: a module classified
     * as shared (not per-processor) must not consume a per-processor module's output during production, or
     * its single proof would silently bind one processor's data. When a shared module reads such an upstream
     * output we throw instead of mis-sharing. Per-processor modules may read anything.
     */
    private guardUpstream(
        ctx: ProofProductionContext,
        module_id: string,
        perProcessor: Set<string>,
    ): ProofProductionContext {
        if (perProcessor.has(module_id)) {
            return ctx;
        }
        const guarded = new Proxy(ctx.upstream, {
            get: (target, prop) => {
                if (typeof prop === "string" && perProcessor.has(prop) && prop in target) {
                    throw new UnsealModuleError(module_id, module_id,
                        `is shared (produced once) but reads per-processor module "${prop}" during production; ` +
                        `flag it requires_unique_proof_per_processor = true`);
                }
                return (target as { [key: string]: ModuleProof })[prop as string];
            },
        });
        return { ...ctx, upstream: guarded };
    }
}
