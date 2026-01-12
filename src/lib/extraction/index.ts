import type { ExtractedContent, SupportedFileType } from '@/lib/types';
import { extractPDF } from './pdf';
import { extractText, extractMarkdown } from './text';

export type Extractor = (buffer: Buffer) => Promise<ExtractedContent>;

const extractors: Record<SupportedFileType, Extractor> = {
  pdf: extractPDF,
  txt: extractText,
  md: extractMarkdown,
  docx: async () => {
    throw new Error('DOCX extraction not yet implemented');
  },
};

export async function extractContent(
  buffer: Buffer,
  fileType: string
): Promise<ExtractedContent> {
  const extractor = extractors[fileType as SupportedFileType];

  if (!extractor) {
    throw new Error(`Unsupported file type: ${fileType}`);
  }

  return extractor(buffer);
}

export function getExtractorForType(fileType: string): Extractor | undefined {
  return extractors[fileType as SupportedFileType];
}

export function isSupportedFileType(fileType: string): fileType is SupportedFileType {
  return fileType in extractors && fileType !== 'docx'; // DOCX not yet supported
}

// Re-export for convenience
export { extractPDF } from './pdf';
export { extractText, extractMarkdown } from './text';
