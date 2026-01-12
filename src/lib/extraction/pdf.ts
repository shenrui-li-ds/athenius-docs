import type { ExtractedContent, ExtractedPage } from '@/lib/types';

// Type for pdf-parse result
interface PdfData {
  text: string;
  numpages: number;
  info?: {
    Title?: string;
    Author?: string;
    CreationDate?: string;
  };
}

type PdfParser = (buffer: Buffer) => Promise<PdfData>;

// Dynamic import to handle ESM/CJS compatibility
async function getPdfParser(): Promise<PdfParser> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParse = await import('pdf-parse') as any;
  return pdfParse.default || pdfParse;
}

export async function extractPDF(buffer: Buffer): Promise<ExtractedContent> {
  try {
    const pdfParse = await getPdfParser();
    const data = await pdfParse(buffer);

    // pdf-parse doesn't provide per-page content directly
    // We'll split by form feed characters or use heuristics
    const pages = splitIntoPages(data.text, data.numpages);

    return {
      text: data.text,
      pages,
      metadata: {
        title: data.info?.Title,
        author: data.info?.Author,
        createdAt: data.info?.CreationDate,
      },
    };
  } catch (error) {
    throw new Error(
      `Failed to extract PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

function splitIntoPages(text: string, numPages: number): ExtractedPage[] {
  // Try to split by form feed characters first (common PDF page separator)
  const formFeedSplit = text.split('\f');

  if (formFeedSplit.length > 1) {
    return formFeedSplit.map((content, index) => ({
      pageNumber: index + 1,
      content: content.trim(),
    })).filter(page => page.content.length > 0);
  }

  // If no form feeds, split evenly by character count
  // This is a fallback heuristic
  if (numPages <= 1) {
    return [{
      pageNumber: 1,
      content: text.trim(),
    }];
  }

  const avgCharsPerPage = Math.ceil(text.length / numPages);
  const pages: ExtractedPage[] = [];

  let currentIndex = 0;
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    let endIndex = currentIndex + avgCharsPerPage;

    // Try to break at paragraph boundaries
    if (endIndex < text.length) {
      const nextParagraph = text.indexOf('\n\n', endIndex - 100);
      if (nextParagraph !== -1 && nextParagraph < endIndex + 200) {
        endIndex = nextParagraph;
      }
    }

    const content = text.slice(currentIndex, endIndex).trim();
    if (content.length > 0) {
      pages.push({
        pageNumber: pageNum,
        content,
      });
    }

    currentIndex = endIndex;

    // Stop if we've processed all text
    if (currentIndex >= text.length) break;
  }

  // Add remaining text to last page
  if (currentIndex < text.length && pages.length > 0) {
    pages[pages.length - 1].content += '\n' + text.slice(currentIndex).trim();
  }

  return pages;
}
