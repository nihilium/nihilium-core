import { StandardProofLibrary } from "../proofs";
import { StandardModuleLibrary } from "../modules";
import { UnsealConditionCollection } from "../collections/UnsealConditionCollection";
import { DefaultAnchoredOpeningProofModule } from "../modules/standard_modules/default_anchored_opening_module";
import { UnsealConditionTemplate } from "../collections/UnsealConditionTemplate";
import { ChangedCallback } from "../collections/types";
import * as staticContracts from "../../../static_contracts";


//The only template directly exported by the privacy lib, all others are to be constructed outside the library.
export function createRevealOnlyCollection(chaindId: number, changedCallback: ChangedCallback = () => {}): 
           {collection: UnsealConditionCollection, template: UnsealConditionTemplate} {

    var collection: UnsealConditionCollection = new UnsealConditionCollection("RevealOnlyValue", "Test", new StandardProofLibrary(), new StandardModuleLibrary(), changedCallback);
    var openingModule: DefaultAnchoredOpeningProofModule = new DefaultAnchoredOpeningProofModule(new StandardProofLibrary());
    var openingNodeId = collection.add_node(openingModule);
    collection.add_data_stream("datastream", openingNodeId, "dual_merkle_root");
    var template = collection.createTemplate(staticContracts.toAddressMap(chaindId));
    return {collection: collection, template: template};
}