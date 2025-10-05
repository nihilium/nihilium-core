# Docker Setup for Privacy Accounts

This directory contains Docker configurations for the privacy-accounts project.

## Services

### Processor Service

### Building the Processor Image

To build the processor Docker image:

```bash
# From the project root directory
docker build -f docker/Dockerfile.processor -t privacy-accounts-processor .
```

### Running with Docker

```bash
# Run the processor container
docker run -p 3006:3006 \
  -e PRIVATE_KEY=your_private_key \
  -e PRIVATE_KEY_HE=your_he_private_key \
  -e CHAINED_PROOF_CONTRACT_ADDRESS=contract_address \
  -e RPC_URL=your_rpc_url \
  -e CHAIN_ID=1337 \
  -e OPENING_PROOF_ADDRESS=opening_proof_address \
  privacy-accounts-processor
```

### Running with Docker Compose

1. Copy the environment template and fill in your values:
```bash
cp docker/docker-compose.processor.yml docker-compose.yml
```

2. Edit the environment variables in the docker-compose.yml file

3. Start the service:
```bash
docker-compose up -d
```

4. Check logs:
```bash
docker-compose logs -f processor
```

5. Stop the service:
```bash
docker-compose down
```

### Datastream Service

#### Building the Datastream Image

To build the datastream Docker image:

```bash
# From the project root directory
docker build -f docker/Dockerfile.datastream -t privacy-accounts-datastream .
```

#### Running with Docker

```bash
# Run the datastream container
docker run -p 3006:3006 \
  -e PRIVATE_KEY=your_private_key \
  -e CONTRACT_ADDRESS=datastream_contract_address \
  -e RPC_URL=your_rpc_url \
  -e CHAIN_ID=1337 \
  -v datastream_data:/app/apps/datastream-server/server-stream \
  privacy-accounts-datastream
```

#### Running with Docker Compose

1. Copy the environment template and fill in your values:
```bash
cp docker/docker-compose.datastream.yml docker-compose.yml
```

2. Edit the environment variables in the docker-compose.yml file

3. Start the service:
```bash
docker-compose up -d
```

4. Check logs:
```bash
docker-compose logs -f datastream
```

5. Stop the service:
```bash
docker-compose down
```

## Environment Variables

### Processor Environment Variables

The processor requires the following environment variables:

- `PRIVATE_KEY`: Private key for the wallet
- `PRIVATE_KEY_HE`: Private key for homomorphic encryption
- `CHAINED_PROOF_CONTRACT_ADDRESS`: Datastream contract address
- `RPC_URL`: RPC URL for the Ethereum node
- `CHAIN_ID`: Chain ID for the Ethereum node (default: 1337)
- `PORT`: Port to run the server on (default: 3006)
- `OPENING_PROOF_ADDRESS`: Opening proof contract address

### Datastream Environment Variables

The datastream service requires the following environment variables:

- `PRIVATE_KEY`: Private key for the wallet (must be the contract owner)
- `CONTRACT_ADDRESS`: Datastream contract address
- `RPC_URL`: RPC URL for the Ethereum node
- `CHAIN_ID`: Chain ID for the Ethereum node (default: 1337)
- `PORT`: Port to run the server on (default: 3006)

## API Endpoints

### Processor Endpoints

- `/health` - Health check endpoint

### Datastream Endpoints

- `/postData` - POST endpoint to add data to the stream
- `/proof/:value` - GET endpoint to retrieve proof for a value
- `/isProvable/:value` - GET endpoint to check if a value is provable
- `/globalTreeIndex` - GET endpoint to get the global tree index
- `/address` - GET endpoint to get the wallet address

## Health Check

- **Processor**: Uses the `/health` endpoint that returns:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

- **Datastream**: Uses the `/address` endpoint for health checking (returns the wallet address)

## Security Notes

- The Dockerfile creates a non-root user (`processor`) for security
- Make sure to use environment variables or Docker secrets for sensitive data
- The default port 3006 is exposed, ensure proper firewall configuration in production 