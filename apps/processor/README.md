# Processor Web Service

A TypeScript-based web service for processing data with CORS enabled.

## Features

- Express.js web server
- TypeScript support
- CORS enabled
- Environment variable configuration
- API endpoints for data processing

## Installation

```bash
# Install dependencies
npm install
```

## Development

```bash
# Run in development mode
npm run dev

# Build the project
npm run build

# Run in production mode
npm start
```

## API Endpoints

- `GET /health` - Health check endpoint
- `GET /api/status` - API status endpoint
- `POST /api/process` - Process data endpoint

## Processor registration

Registering the processor is a separate process, the processor runs without the stake management
and without 'knowledge' of it's own registration.

In order to register user the registry-manager project.

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
PORT=3006
NODE_ENV=development 
RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
CHAIN_ID=43113
CHAIN_PRIVATE_KEY=0x.....
CHAINED_PROOF_CONTRACT_ADDRESS=0x4E5bbAa6086da95A991240C6D88B4218B20eC8F1
OPENING_PROOF_ADDRESS=0x......
PRIVATE_KEY=0x......
PRIVATE_KEY_HE=0x........


``` 