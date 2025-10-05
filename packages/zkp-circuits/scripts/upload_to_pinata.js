#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const FormData = require('form-data');
require('dotenv').config();

// Configuration
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;

if (!PINATA_API_KEY || !PINATA_SECRET_API_KEY) {
  console.error('Error: PINATA_API_KEY and PINATA_SECRET_API_KEY must be set in .env file');
  process.exit(1);
}

// Get circuit name from command line
const circuitName = process.argv[2];
if (!circuitName) {
  console.error('Usage: node upload_to_pinata.js <circuit_name>');
  console.error('Example: node upload_to_pinata.js opening_proof');
  process.exit(1);
}

// Define paths
const buildDir = path.join(__dirname, '../circom-circuits/build', circuitName);
const ipfsRefsDir = path.join(__dirname, '../src/ipfsrefs');

// File mappings: source file pattern -> destination name
const fileMapping = {
  'groth16_verifier.sol': 'verifier.sol',
  'groth16_vkey.json': 'vkey.json',
  'groth16_pkey.zkey': 'zkey.zkey',
  [`${circuitName}_js/${circuitName}.wasm`]: 'wasm.wasm'
};

async function uploadToIPFS(filePath, fileName) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), fileName);

    const options = {
      method: 'POST',
      hostname: 'api.pinata.cloud',
      path: '/pinning/pinFileToIPFS',
      headers: {
        'pinata_api_key': PINATA_API_KEY,
        'pinata_secret_api_key': PINATA_SECRET_API_KEY,
        ...form.getHeaders()
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          const response = JSON.parse(data);
          resolve(response.IpfsHash);
        } else {
          reject(new Error(`Upload failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    form.pipe(req);
  });
}

async function uploadFiles() {
  console.log(`Uploading circuit files for: ${circuitName}`);
  console.log(`Build directory: ${buildDir}\n`);

  const results = {
    circuitName: circuitName,
    files: {}
  };

  for (const [sourcePattern, destName] of Object.entries(fileMapping)) {
    const sourcePath = path.join(buildDir, sourcePattern);
    
    if (!fs.existsSync(sourcePath)) {
      console.warn(`Warning: File not found: ${sourcePath}`);
      continue;
    }

    console.log(`Uploading ${sourcePattern} as ${destName}...`);
    
    try {
      const ipfsHash = await uploadToIPFS(sourcePath, destName);
      results.files[destName] = ipfsHash;
      console.log(`✓ Uploaded: ${destName} -> ${ipfsHash}\n`);
    } catch (error) {
      console.error(`✗ Failed to upload ${sourcePattern}:`, error.message);
      throw error;
    }
  }

  // Ensure ipfsrefs directory exists
  if (!fs.existsSync(ipfsRefsDir)) {
    fs.mkdirSync(ipfsRefsDir, { recursive: true });
  }

  // Write results to JSON file
  const outputPath = path.join(ipfsRefsDir, `${circuitName}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  console.log(`\n✓ Upload complete!`);
  console.log(`Output written to: ${outputPath}`);
  console.log(`\nResults:`);
  console.log(JSON.stringify(results, null, 2));

  return results;
}

// Run the upload
uploadFiles().catch(error => {
  console.error('Upload failed:', error);
  process.exit(1);
});
