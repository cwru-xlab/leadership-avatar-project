import mammoth from "mammoth";

export interface TextChunk {
  text: string;
  chunkIndex: number;
  totalChunks: number;
}

export interface ProcessedDocument {
  title: string;
  chunks: TextChunk[];
  metadata: {
    source: "file";
    sourceId: string;
    originalText: string;
    processingDate: string;
  };
}

/** The PDF needs a password to open, so no text can be read from it. */
export class PdfPasswordError extends Error {
  constructor() {
    super("PDF is password-protected");
    this.name = "PdfPasswordError";
  }
}

export class DocumentProcessor {
  // Extract text from PDF buffer.
  //
  // pdfjs-dist, not pdf2json: pdf2json 4.x returns raw (no longer
  // URI-encoded) runs, so the old decodeURIComponent threw "URI malformed" on
  // any PDF containing a bare "%" ("grew revenue 20%"), it split ligature
  // fonts into single glyphs ("Teﬆcase"), glued lines together, and it
  // rejects AES-256 owner-restricted PDFs that open without a password.
  // pdfjs-dist is already a serverExternalPackage for the deck pipeline.
  async extractTextFromPDF(buffer: Buffer): Promise<string> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Copy: pdfjs may transfer/detach the underlying ArrayBuffer.
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
    });
    let doc: Awaited<typeof loadingTask.promise>;
    try {
      doc = await loadingTask.promise;
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "PasswordException") {
        throw new PdfPasswordError();
      }
      throw new Error(
        `PDF parsing error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      let fullText = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        for (const item of content.items) {
          if ("str" in item) fullText += item.str + (item.hasEOL ? "\n" : "");
        }
        fullText += "\n";
      }
      return fullText;
    } finally {
      await doc.destroy();
    }
  }

  // Extract text from TXT buffer
  async extractTextFromTXT(buffer: Buffer): Promise<string> {
    try {
      // First, try UTF-8 with validation
      const utf8Text = buffer.toString('utf-8');

      // Check for UTF-8 validity by looking for replacement characters
      // that indicate invalid UTF-8 sequences
      if (utf8Text.includes('\uFFFD')) {
        console.warn("Invalid UTF-8 detected, attempting fallback encodings");

        // Try common fallback encodings
        try {
          // Try Latin-1 (ISO-8859-1) which can decode any byte sequence
          const latin1Text = buffer.toString('latin1');
          console.info("Successfully decoded using Latin-1 encoding");
          return latin1Text;
        } catch (latin1Error) {
          // Try ASCII as last resort
          try {
            const asciiText = buffer.toString('ascii');
            console.info("Successfully decoded using ASCII encoding");
            return asciiText;
          } catch (asciiError) {
            throw new Error("Unable to decode text file with UTF-8, Latin-1, or ASCII encoding");
          }
        }
      }

      return utf8Text;
    } catch (error) {
      console.error("Failed to extract text from TXT:", error);
      if (error instanceof Error && error.message.includes("encoding")) {
        throw new Error(`Text encoding error: ${error.message}`);
      }
      throw new Error("Failed to extract text from TXT file");
    }
  }

  // Extract text from DOCX buffer
  async extractTextFromDOCX(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      console.error("Failed to extract text from DOCX:", error);
      throw new Error("Failed to extract text from DOCX file");
    }
  }

  // Extract text based on file type
  async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    switch (mimeType) {
      case "application/pdf":
        return await this.extractTextFromPDF(buffer);
      case "text/plain":
        return await this.extractTextFromTXT(buffer);
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return await this.extractTextFromDOCX(buffer);
      default:
        throw new Error(`Unsupported file type: ${mimeType}. Supported types: PDF, TXT, DOCX`);
    }
  }

  // Clean extracted text
  cleanText(text: string): string {
    return text
      .replace(/[^\S\n]+/g, " ") // Collapse spaces and tabs, keep line breaks
      .replace(/ ?\n ?/g, "\n") // Drop spaces hugging a line break
      .replace(/\n{3,}/g, "\n\n") // Replace multiple newlines with double newline
      .trim(); // Remove leading/trailing whitespace
  }

  // Split text into chunks
  chunkText(
    text: string,
    maxTokens: number = 500,
    overlapTokens: number = 50,
  ): TextChunk[] {
    const cleanedText = this.cleanText(text);

    // Rough token estimation: ~4 characters per token
    const maxChars = maxTokens * 4;
    const overlapChars = overlapTokens * 4;

    const chunks: TextChunk[] = [];
    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < cleanedText.length) {
      let endIndex = startIndex + maxChars;

      // If we're not at the end of the text, find a good break point
      if (endIndex < cleanedText.length) {
        // Look for sentence ending within the last 100 characters
        const searchStart = Math.max(endIndex - 100, startIndex);
        const sentenceEnd = cleanedText.lastIndexOf(".", endIndex);
        const questionEnd = cleanedText.lastIndexOf("?", endIndex);
        const exclamationEnd = cleanedText.lastIndexOf("!", endIndex);

        const bestEnd = Math.max(sentenceEnd, questionEnd, exclamationEnd);

        if (bestEnd > searchStart) {
          endIndex = bestEnd + 1;
        } else {
          // Fall back to word boundary
          const spaceIndex = cleanedText.lastIndexOf(" ", endIndex);

          if (spaceIndex > searchStart) {
            endIndex = spaceIndex;
          }
        }
      }

      const chunkText = cleanedText.slice(startIndex, endIndex).trim();

      if (chunkText.length > 0) {
        chunks.push({
          text: chunkText,
          chunkIndex,
          totalChunks: 0, // Will be updated after all chunks are created
        });
        chunkIndex++;
      }

      // Move start index with overlap
      startIndex = endIndex - overlapChars;

      // Ensure we don't go backwards
      if (startIndex <= 0) {
        startIndex = endIndex;
      }
    }

    // Update total chunks count
    chunks.forEach((chunk) => {
      chunk.totalChunks = chunks.length;
    });

    return chunks;
  }

  // Process document from buffer
  async processDocument(
    buffer: Buffer,
    mimeType: string,
    sourceId: string,
    title: string,
    source: "file" = "file",
  ): Promise<ProcessedDocument> {
    try {
      // Extract text
      const rawText = await this.extractText(buffer, mimeType);

      // Clean and chunk text
      const chunks = this.chunkText(rawText);

      return {
        title,
        chunks,
        metadata: {
          source,
          sourceId,
          originalText: rawText,
          processingDate: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("Failed to process document:", error);
      throw new Error("Failed to process document");
    }
  }

  // Get supported MIME types
  getSupportedMimeTypes(): string[] {
    return [
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
  }

  // Check if file type is supported
  isSupported(mimeType: string): boolean {
    return this.getSupportedMimeTypes().includes(mimeType);
  }

  // Estimate token count (rough approximation)
  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // Generate document summary
  generateSummary(text: string, maxLength: number = 200): string {
    const cleaned = this.cleanText(text);

    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    // Find a good break point near the max length
    const breakPoint = cleaned.lastIndexOf(".", maxLength);

    if (breakPoint > maxLength * 0.5) {
      return cleaned.slice(0, breakPoint + 1);
    }

    return cleaned.slice(0, maxLength) + "...";
  }
}

// Export singleton instance
export const documentProcessor = new DocumentProcessor();
