// src/lib/resume/pdfkit.d.ts
// Minimal ambient type declarations for `pdfkit` (no upstream @types/pdfkit
// is installed). We only use the surface area we actually call: the
// `PDFDocument` constructor and its chainable text/layout methods.

declare module 'pdfkit' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Any = any;

  interface PDFDocumentOptions {
    size?: 'LETTER' | 'A4' | 'A3' | 'LEGAL' | 'TABLOID' | [number, number];
    margins?: { top: number; bottom: number; left: number; right: number };
    info?: {
      Title?: string;
      Author?: string;
      Subject?: string;
      Keywords?: string;
      Creator?: string;
      Producer?: string;
    };
  }

  class PDFDocument {
    constructor(options?: PDFDocumentOptions);
    pipe<T>(destination: T): T;
    font(name: string): PDFDocument;
    fontSize(size: number): PDFDocument;
    text(text: string, options?: Any): PDFDocument;
    moveDown(lines?: number): PDFDocument;
    addPage(): PDFDocument;
    end(): void;
    on(event: 'data', listener: (chunk: Buffer) => void): PDFDocument;
    on(event: 'end', listener: () => void): PDFDocument;
    on(event: 'error', listener: (err: Error) => void): PDFDocument;
  }

  export default PDFDocument;
}
