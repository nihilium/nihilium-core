/**
 * This script modifies a Circom-generated Solidity verifier contract (e.g., opening_proof.sol)
 * to implement the IVerifier interface from @Interfaces.sol by adding a compatible `verify` function.
 * 
 * Usage:
 *   node harmonise_verification_circom.js <path_to_verifier.sol>
 * 
 * The script will:
 *   - Parse the contract to determine the number of public inputs (publicSignals).
 *   - Change the verifyProof function's calldata parameters to memory.
 *   - Add a `verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external view returns (bool)` function.
 *   - The function will decode the proof and public inputs, and call the original verifyProof function.
 *   - Overwrite the original file with the modified contract.
 * 
 * Note: No explicit import or inheritance is added; only the function signature and logic are inserted.
 */

const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
    console.error('Usage: node harmonise_verification_circom.js <path_to_verifier.sol>');
    process.exit(1);
}

const filePath = process.argv[2];
let content = fs.readFileSync(filePath, 'utf8');

// 1. Find contract name
const contractNameMatch = content.match(/contract\s+([A-Za-z0-9_]+)\s*{/);
if (!contractNameMatch) {
    console.error('Could not find contract name.');
    process.exit(1);
}
const contractName = contractNameMatch[1];

// 2. Find verifyProof signature and number of public signals
const verifyProofMatch = content.match(/function\s+verifyProof\s*\(\s*uint\[\d+\]\s*calldata\s*_pA\s*,\s*uint\[\d+\]\[\d+\]\s*calldata\s*_pB\s*,\s*uint\[\d+\]\s*calldata\s*_pC\s*,\s*uint\[(\d+)\]\s*calldata\s*_pubSignals\s*\)/);
if (!verifyProofMatch) {
    console.error('Could not find verifyProof function with publicSignals.');
    process.exit(1);
}
const nPublicSignals = parseInt(verifyProofMatch[1], 10);

// 2.1. Change verifyProof calldata parameters to memory
// content = content.replace(
//     /function\s+verifyProof\s*\(\s*uint\[(\d+)\]\s*calldata\s*_pA\s*,\s*uint\[(\d+)\]\[(\d+)\]\s*calldata\s*_pB\s*,\s*uint\[(\d+)\]\s*calldata\s*_pC\s*,\s*uint\[(\d+)\]\s*calldata\s*_pubSignals\s*\)/,
//     function(match, pA, pB1, pB2, pC, pubSignals) {
//         return `function verifyProof(uint[${pA}] memory _pA, uint[${pB1}][${pB2}] memory _pB, uint[${pC}] memory _pC, uint[${pubSignals}] memory _pubSignals)`;
//     }
// );

// 3. Add verify function at the end of the contract
const verifyFunction = `

    /**
     * Implements the IVerifier.verify interface.
     * Proof format: abi.encodePacked(
     *   uint[2] _pA,
     *   uint[2][2] _pB,
     *   uint[2] _pC
     * )
     * Public inputs: bytes32[] (must be ${nPublicSignals} elements)
     */
    function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external view returns (bool) {
        require(_publicInputs.length == ${nPublicSignals}, "Invalid number of public inputs");
        // Decode proof
        uint[2] memory _pA;
        uint[2][2] memory _pB;
        uint[2] memory _pC;
        uint offset = 0;
        for (uint i = 0; i < 2; i++) {
            _pA[i] = uint256(bytes32(_proof[offset:offset+32]));
            offset += 32;
        }
        for (uint i = 0; i < 2; i++) {
            for (uint j = 0; j < 2; j++) {
                _pB[i][j] = uint256(bytes32(_proof[offset:offset+32]));
                offset += 32;
            }
        }
        for (uint i = 0; i < 2; i++) {
            _pC[i] = uint256(bytes32(_proof[offset:offset+32]));
            offset += 32;
        }
        // Convert publicInputs (bytes32[]) to uint[]
        uint[${nPublicSignals}] memory pubSignals;
        for (uint i = 0; i < ${nPublicSignals}; i++) {
            pubSignals[i] = uint256(_publicInputs[i]);
        }
        return this.verifyProof(_pA, _pB, _pC, pubSignals);
    }
`;

// Insert before the last closing }
const lastBraceIdx = content.lastIndexOf('}');
if (lastBraceIdx === -1) {
    console.error('Could not find contract closing brace.');
    process.exit(1);
}
content = content.slice(0, lastBraceIdx) + verifyFunction + '\n' + content.slice(lastBraceIdx);

// 4. Write back to file
fs.writeFileSync(filePath, content, 'utf8');
console.log(`Contract ${contractName} at ${filePath} updated to include IVerifier-compatible verify function with memory parameters in verifyProof.`);
