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

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
PORT=3000
NODE_ENV=development
``` 