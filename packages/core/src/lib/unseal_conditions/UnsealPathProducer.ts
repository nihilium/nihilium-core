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
        for (const { compiled_module, module } of this.modulesForPath(proof_index)) {
            if (module.requires_unique_proof_per_processor) {
                ids.add(compiled_module.module_id);
            }
        }
        return ids;
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
                const produceCtx = this.guardUpstream(ctx, module_id, perProcessor);
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
