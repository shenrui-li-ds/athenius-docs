import type { ExtractedContent } from '@/lib/types';

export async function extractText(buffer: Buffer): Promise<ExtractedContent> {
  try {
    const text = buffer.toString('utf-8');

    return {
      text,
      // Text files don't have pages
      pages: [{
        pageNumber: 1,
        content: text,
      }],
    };
  } catch (error) {
    throw new Error(
      `Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function extractMarkdown(buffer: Buffer): Promise<ExtractedContent> {
  try {
    const text = buffer.toString('utf-8');

    // For markdown, we can try to identify sections by headers
    const sections = splitMarkdownBySections(text);

    return {
      text,
      pages: sections.length > 0 ? sections : [{
        pageNumber: 1,
        content: text,
      }],
    };
  } catch (error) {
    throw new Error(
      `Failed to extract markdown: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

function splitMarkdownBySections(text: string): { pageNumber: number; content: string }[] {
  // Split by top-level headers (# or ##)
  const headerRegex = /^#{1,2}\s+.+$/gm;
  const matches = [...text.matchAll(headerRegex)];

  if (matches.length === 0) {
    return [];
  }

  const sections: { pageNumber: number; content: string }[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const startIndex = match.index!;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index! : text.length;
    const content = text.slice(startIndex, endIndex).trim();

    if (content.length > 0) {
      sections.push({
        pageNumber: i + 1,
        content,
      });
    }
  }

  // If there's content before the first header, prepend it
  if (matches.length > 0 && matches[0].index! > 0) {
    const preContent = text.slice(0, matches[0].index!).trim();
    if (preContent.length > 0) {
      sections.unshift({
        pageNumber: 0,
        content: preContent,
      });
      // Renumber
      sections.forEach((s, i) => s.pageNumber = i + 1);
    }
  }

  return sections;
}
