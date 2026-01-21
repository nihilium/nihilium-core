/**
 * Build a lookup table to break discrete log for 32-bit scalars for decoding
 * @param precomputeSize the size of the lookup table to be used --> 2**pc_size
 * @returns an object that contains 2**pc_size of keys and values
 */
export declare function precompute(precomputeSize: number): {
    [key: string]: string;
};
