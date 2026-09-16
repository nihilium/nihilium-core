// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

import "./IVerifier.sol";

/**
 * @title FormatBoundData
 * @notice Contract for formatting bound data, focusing on custom data encoding
 * @dev Implements the custom data encoding part of formatBoundData
 *      Format: [identifier (3), length_high_byte, length_low_byte, ...utf8_bytes]
 */
contract FormatBoundData is IVerifier {
    uint8 public constant BOUND_DATA_IDENTIFIER_CUSTOM_DATA = 3;
    uint256 public constant MAX_DATA_LENGTH = 509;
    uint8 public constant PROOF_TYPE_BIND = 8; // Adjust if different
    uint256 public constant PROOF_TYPE_LENGTH_BIND_EVM = 509;
    uint256 public constant MAX_FIELD_SIZE = 31; // 31 bytes = 248 bits, fits in uint256

    error DataTooLong(uint256 length);
    error EmptyCustomData();
    error InputTooLong(uint256 length, uint256 maxLength);

    /**
     * @notice Formats custom data according to the bound data encoding scheme
     * @param customData The custom data string to encode
     * @return formattedData The encoded data as a bytes array
     * @dev Encodes custom data as: [identifier (3), length_high_byte, length_low_byte, ...utf8_bytes]
     */
    function formatCustomData(string memory customData) public pure returns (bytes memory formattedData) {
        bytes memory dataBytes = bytes(customData);
        
        // Check if custom data is empty
        if (dataBytes.length == 0) {
            revert EmptyCustomData();
        }

        // Calculate total length: 1 byte (identifier) + 2 bytes (length) + data length
        uint256 totalLength = 1 + 2 + dataBytes.length;
        
        // Check if total data exceeds maximum length
        if (totalLength > MAX_DATA_LENGTH) {
            revert DataTooLong(totalLength);
        }

        // Allocate memory for formatted data
        formattedData = new bytes(totalLength);
        
        // Set identifier (CUSTOM_DATA = 3)
        formattedData[0] = bytes1(BOUND_DATA_IDENTIFIER_CUSTOM_DATA);
        
        // Set length as 2-byte big-endian
        uint256 dataLength = dataBytes.length;
        formattedData[1] = bytes1(uint8((dataLength >> 8) & 0xff));
        formattedData[2] = bytes1(uint8(dataLength & 0xff));
        
        // Copy the UTF-8 encoded data
        for (uint256 i = 0; i < dataBytes.length; i++) {
            formattedData[3 + i] = dataBytes[i];
        }
        
        return formattedData;
    }

    /**
     * @notice Formats custom data and returns as uint8 array
     * @param customData The custom data string to encode
     * @return formattedData The encoded data as a uint8 array
     */
    function formatCustomDataAsUint8Array(string memory customData) public pure returns (uint8[] memory formattedData) {
        bytes memory bytesData = formatCustomData(customData);
        formattedData = new uint8[](bytesData.length);
        
        for (uint256 i = 0; i < bytesData.length; i++) {
            formattedData[i] = uint8(bytesData[i]);
        }
        
        return formattedData;
    }

    /**
     * @notice Right-pads a bytes array with zeros to the specified length
     * @param data The input data to pad
     * @param maxLength The target length
     * @return paddedData The padded data
     */
    function rightPadArrayWithZeros(bytes memory data, uint256 maxLength) public pure returns (bytes memory paddedData) {
        if (data.length > maxLength) {
            revert InputTooLong(data.length, maxLength);
        }
        
        if (data.length == maxLength) {
            return data;
        }
        
        paddedData = new bytes(maxLength);
        for (uint256 i = 0; i < data.length; i++) {
            paddedData[i] = data[i];
        }
        // Remaining bytes are already zero-initialized
        
        return paddedData;
    }

    /**
     * @notice Converts a number to big-endian bytes
     * @param n The number to convert
     * @param len The number of bytes to output
     * @return result The big-endian byte representation
     */
    function numberToBytesBE(uint256 n, uint256 len) public pure returns (bytes memory result) {
        result = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            result[len - 1 - i] = bytes1(uint8((n >> (i * 8)) & 0xff));
        }
        return result;
    }

    /**
     * @notice Packs big-endian bytes into a field element (uint256)
     * @param x The bytes to pack
     * @param maxFieldSize The maximum number of bytes to pack (typically 31)
     * @return result The packed field element
     */
    function packBeBytesIntoField(bytes memory x, uint256 maxFieldSize) public pure returns (uint256 result) {
        require(x.length >= maxFieldSize, "Input too short");
        
        result = 0;
        for (uint256 i = 0; i < maxFieldSize; i++) {
            result = result * 256 + uint256(uint8(x[i]));
        }
        return result;
    }

    /**
     * @notice Computes SHA256 hash of input data using the precompile
     * @param data The data to hash
     * @return hash The SHA256 hash (32 bytes)
     * @dev Uses view instead of pure because precompile calls are considered external
     */
    function computeSha256(bytes memory data) public view returns (bytes32 hash) {
        assembly {
            // Call SHA256 precompile at address 0x02
            // Note: staticcall to precompile is pure, but linter may flag it
            let ptr := mload(0x40)
            let dataLen := mload(data)
            let dataPtr := add(data, 0x20)
            
            // Copy data to memory for precompile call
            let success := staticcall(gas(), 0x02, dataPtr, dataLen, ptr, 0x20)
            if iszero(success) {
                revert(0, 0)
            }
            hash := mload(ptr)
        }
    }

    /**
     * @notice Gets the BIND EVM parameter commitment
     * @param data The bound data (output of formatCustomData)
     * @param maxLength The maximum length for padding (default 509)
     * @return commitment The commitment as a uint256
     * @dev Computes: SHA256([ProofType.BIND, length_high, length_low, ...paddedData])[0:31] as uint256
     */
    function getBindEVMParameterCommitment(
        bytes memory data,
        uint256 maxLength
    ) public view returns (uint256 commitment) {
        // Right-pad the data with zeros
        bytes memory paddedData = rightPadArrayWithZeros(data, maxLength);
        
        // Create the input: [ProofType.BIND, length_high, length_low, ...paddedData]
        bytes memory lengthBytes = numberToBytesBE(PROOF_TYPE_LENGTH_BIND_EVM, 2);
        
        // Concatenate: ProofType + length + paddedData
        bytes memory input = new bytes(1 + 2 + paddedData.length);
        input[0] = bytes1(PROOF_TYPE_BIND);
        input[1] = lengthBytes[0];
        input[2] = lengthBytes[1];
        
        for (uint256 i = 0; i < paddedData.length; i++) {
            input[3 + i] = paddedData[i];
        }
        
        // Compute SHA256 hash
        bytes32 hash = computeSha256(input);
        
        // Pack first 31 bytes into uint256 (field element)
        bytes memory hashBytes = new bytes(32);
        assembly {
            mstore(add(hashBytes, 0x20), hash)
        }
        
        commitment = packBeBytesIntoField(hashBytes, MAX_FIELD_SIZE);
        return commitment;
    }

    /**
     * @notice Gets the BIND EVM parameter commitment with default maxLength of 509
     * @param data The bound data (output of formatCustomData)
     * @return commitment The commitment as a uint256
     */
    function getBindEVMParameterCommitment(bytes memory data) public view returns (uint256 commitment) {
        return getBindEVMParameterCommitment(data, PROOF_TYPE_LENGTH_BIND_EVM);
    }

    /**
     * @notice Converts bytes32 to hex string representation (UTF-8 encoded)
     * @param data The bytes32 data to convert
     * @return hexString The hex string as bytes (UTF-8 encoded, e.g., "0x...")
     */
    function bytes32ToHexString(bytes32 data) public pure returns (bytes memory hexString) {
        // Hex string format: "0x" + 64 hex characters = 66 bytes total
        hexString = new bytes(66);
        hexString[0] = '0';
        hexString[1] = 'x';
        
        bytes memory hexChars = "0123456789abcdef";
        
        // Convert each byte to two hex characters
        for (uint256 i = 0; i < 32; i++) {
            uint8 byteValue = uint8(data[i]);
            hexString[2 + i * 2] = hexChars[byteValue >> 4];
            hexString[3 + i * 2] = hexChars[byteValue & 0x0f];
        }
        
        return hexString;
    }

    /**
     * @notice Formats bytes32 data by converting to hex string first, then formatting
     * @param data The bytes32 data to format
     * @return formattedData The encoded data as a bytes array
     * @dev Converts bytes32 to hex string (UTF-8), then formats it like formatCustomData
     */
    function formatBytes32Data(bytes32 data) public pure returns (bytes memory formattedData) {
        // Convert bytes32 to hex string representation (UTF-8 encoded)
        bytes memory hexString = bytes32ToHexString(data);
        
        // Now format it like formatCustomData would format a string
        // Calculate total length: 1 byte (identifier) + 2 bytes (length) + hex string length
        uint256 totalLength = 1 + 2 + hexString.length;
        
        // Allocate memory for formatted data
        formattedData = new bytes(totalLength);
        
        // Set identifier (CUSTOM_DATA = 3)
        formattedData[0] = bytes1(BOUND_DATA_IDENTIFIER_CUSTOM_DATA);
        
        // Set length as 2-byte big-endian
        uint256 dataLength = hexString.length;
        formattedData[1] = bytes1(uint8((dataLength >> 8) & 0xff));
        formattedData[2] = bytes1(uint8(dataLength & 0xff));
        
        // Copy the hex string bytes (UTF-8 encoded)
        for (uint256 i = 0; i < hexString.length; i++) {
            formattedData[3 + i] = hexString[i];
        }
        
        return formattedData;
    }

    /**
     * @notice Verifies that the commitment matches the expected public input
     * @param _publicInputs Array where _publicInputs[0] is the expected commitment as bytes32, _publicInputs[1] is the original_value as bytes32
     * @return true if the commitment matches, false otherwise
     * @dev Formats _publicInputs[1] (bytes32) as hex string, computes commitment, and compares with _publicInputs[0]
     */
   function verify(bytes calldata, bytes32[] calldata _publicInputs) external view override returns (bool) {
    require(_publicInputs.length == 2, "Public inputs array must have 2 elements");
    
    bytes memory formattedData = formatBytes32Data(_publicInputs[1]);
    
    // Compute the commitment from the formatted data
    uint256 computedCommitment = getBindEVMParameterCommitment(formattedData);
    
    // Convert the expected commitment from bytes32 to uint256
    uint256 expectedCommitment = uint256(_publicInputs[0]);
    
    // Compare the commitments
    return computedCommitment == expectedCommitment;
}
}

