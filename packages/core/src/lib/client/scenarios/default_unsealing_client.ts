import { NihiliumSeal, ProcessorEndpoint } from "../../../types/protocol/common";
import { IDualDataStream } from "../../data_stream/types";
import { NihiliumUnsealingClient, NihiliumUnsealingClientOptions } from "../unsealing_client";

/**
 * The default unseal scenario: reveal-only. The single anchored opening module is context-driven, so
 * there are no external proofs, no resolvers, and no scenario setup — the base client already does
 * everything needed.
 *
 * This subclass exists as the canonical, named starting point for the default policy and as the template
 * to copy when building a new scenario: extend NihiliumUnsealingClient and override any of
 * `prepareProofProduction`, `buildResolvers`, `buildProvidedProofs` (see ZKEmailUnsealingClient).
 */
export class DefaultUnsealingClient extends NihiliumUnsealingClient {
    constructor(
        seal: NihiliumSeal,
        processors: ProcessorEndpoint[],
        dataStreams: IDualDataStream[],
        opts: NihiliumUnsealingClientOptions = {},
    ) {
        super(seal, processors, dataStreams, opts);
    }
}
