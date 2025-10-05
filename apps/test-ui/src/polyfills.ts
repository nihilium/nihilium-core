if (typeof globalThis === 'undefined') {
    (window as any).globalThis = window;
  }
  if (typeof global === 'undefined') {
    (window as any).global = window;
  }

  export {};