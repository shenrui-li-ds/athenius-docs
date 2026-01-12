import { describe, it, expect } from 'vitest';
import { extractText, extractMarkdown } from './text';

describe('extractText', () => {
  it('should extract plain text from buffer', async () => {
    const text = 'Hello, this is a test document.\nWith multiple lines.';
    const buffer = Buffer.from(text, 'utf-8');

    const result = await extractText(buffer);

    expect(result.text).toBe(text);
    expect(result.pages).toHaveLength(1);
    expect(result.pages![0].pageNumber).toBe(1);
    expect(result.pages![0].content).toBe(text);
  });

  it('should handle empty text', async () => {
    const buffer = Buffer.from('', 'utf-8');

    const result = await extractText(buffer);

    expect(result.text).toBe('');
    expect(result.pages).toHaveLength(1);
  });

  it('should handle unicode text', async () => {
    const text = '你好世界 🌍 Привет мир';
    const buffer = Buffer.from(text, 'utf-8');

    const result = await extractText(buffer);

    expect(result.text).toBe(text);
  });

  it('should preserve whitespace and formatting', async () => {
    const text = '  Indented text\n\n\nMultiple newlines\t\tTabs';
    const buffer = Buffer.from(text, 'utf-8');

    const result = await extractText(buffer);

    expect(result.text).toBe(text);
  });
});

describe('extractMarkdown', () => {
  it('should extract markdown and identify sections by headers', async () => {
    const markdown = `# Header 1

This is content under header 1.

## Header 2

This is content under header 2.

## Header 3

This is content under header 3.`;

    const buffer = Buffer.from(markdown, 'utf-8');

    const result = await extractMarkdown(buffer);

    expect(result.text).toBe(markdown);
    expect(result.pages!.length).toBeGreaterThan(1);
  });

  it('should handle markdown without headers', async () => {
    const markdown = `This is just plain text.
No headers here.
Just regular content.`;

    const buffer = Buffer.from(markdown, 'utf-8');

    const result = await extractMarkdown(buffer);

    expect(result.text).toBe(markdown);
    expect(result.pages).toHaveLength(1);
    expect(result.pages![0].content).toBe(markdown);
  });

  it('should handle content before first header', async () => {
    const markdown = `Some intro text before any headers.

# First Header

Content after the header.`;

    const buffer = Buffer.from(markdown, 'utf-8');

    const result = await extractMarkdown(buffer);

    expect(result.pages!.length).toBe(2);
    expect(result.pages![0].content).toContain('Some intro text');
    expect(result.pages![1].content).toContain('First Header');
  });

  it('should handle single header', async () => {
    const markdown = `# Only Header

All the content is here.`;

    const buffer = Buffer.from(markdown, 'utf-8');

    const result = await extractMarkdown(buffer);

    expect(result.pages!.length).toBe(1);
    expect(result.pages![0].content).toContain('Only Header');
  });

  it('should number pages sequentially', async () => {
    const markdown = `# Section 1
Content 1

## Section 2
Content 2

## Section 3
Content 3`;

    const buffer = Buffer.from(markdown, 'utf-8');

    const result = await extractMarkdown(buffer);

    result.pages!.forEach((page, index) => {
      expect(page.pageNumber).toBe(index + 1);
    });
  });

  it('should handle empty markdown', async () => {
    const buffer = Buffer.from('', 'utf-8');

    const result = await extractMarkdown(buffer);

    expect(result.text).toBe('');
    expect(result.pages).toHaveLength(1);
  });
});
