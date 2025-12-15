# Unseal conditions

The unseal conditions are the conditions one can select for unsealing.
The protocol enforces only a single proof to be present.

The structure is as followed:

- Proofs: simple constructs that either produce true or false, can be something like a signature verifycation, ZKPRoof or simple 'greater then'. It also describes what 'public signals' are available. Requires an on-chain address for verification. Are not to be used in isolation.
- Actions: these are the lowest level instruction sets that maps different proofs together.
- Modules: a single or group of proofs that wrap isolated functionality in a logical component. Has a human readable description and defines the methods on how to produce the proofs internal to the module. It defines what inputs it requires and what public signals of the internal proofs it passes on as outputs. Can also require static variables. Also produces a true/false.
- Collection: A single or collection of modules that describes the order of modules to be executed. A collection is also responsible for branching inside the unseal conditions. This means here we define that an output of a module 'before time X' can create two branches. Like before time X party XYZ has access and on false party ABC has access to it. It defines what information must come from users. Collections are NOT composable.
- Compiled collection: simply the collection but then internally consistent references represented as a 'ChainedProof' that is generic in nature that can be used by a processor and smart contract to verify if the unseal conditions are met. It produces an unseal_root as identifier to be used. It also holds code/function references to be called for proof generation. During the stage of compile it also takes any input obtained for a user to place the limits it wants to set like timelocks.
- ChainedProof: the endresult of executing a compiled collection, this is the whole set of instructions that need to be send to a processor