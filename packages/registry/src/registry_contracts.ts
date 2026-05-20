export type RegistryContracts = {

    [chainId: number]: {
        processorRegistry: string;
        datastreamRegistry: string;
        conditionVerifierRegistry: string;
    }
}
export const registryContracts: RegistryContracts = {
    43113: {
        processorRegistry: "0x4a1eA4216eC4e45B1E1668586f8fd53F19F1b465",
        datastreamRegistry: "0x0000000000000000000000000000000000000000",
        conditionVerifierRegistry: "0x0000000000000000000000000000000000000000",
    },
    13113: {
        processorRegistry: "0x0000000000000000000000000000000000000000",
        datastreamRegistry: "0x0000000000000000000000000000000000000000",
        conditionVerifierRegistry: "0x0000000000000000000000000000000000000000",
    },
}