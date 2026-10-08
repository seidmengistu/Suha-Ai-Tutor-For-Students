/// <reference types="vite/client" />

// Allow PDF.js worker import: `import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'`
declare module '*?url' {
  const src: string
  export default src
}
