#!/bin/bash

# Usage: ./rename_contract.sh <old_name> <new_name> <filename>

NEW_NAME="$1"
FILE="$2"

if [[ -z "$NEW_NAME" || -z "$FILE" ]]; then
  echo "Usage: $0 <old_contract_name> <new_contract_name> <filename>"
  exit 1
fi

# Replace the contract declaration line
sed -i "s/contract Groth16Verifier /contract $NEW_NAME /" "$FILE"
sed -i "s/contract PlonkVerifier /contract $NEW_NAME /" "$FILE"

# Optionally replace all other occurrences (e.g., if referenced elsewhere)
# Uncomment this if needed:
# sed -i "s/\b$OLD_NAME\b/$NEW_NAME/g" "$FILE"

echo "Renamed contract $OLD_NAME to $NEW_NAME in $FILE"
