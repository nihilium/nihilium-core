// src/vite-env.d.ts
/// <reference types="vite/client" />

declare module '*?url' {
    const url: string;
    export default url;
  }
  
  // (Optional but explicit)
  declare module '*.wasm?url' { const url: string; export default url; }
  declare module '*.zkey?url' { const url: string; export default url; }
  declare module '*.json?url' { const url: string; export default url; }
  