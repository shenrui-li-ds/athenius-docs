import { describe, it, expect } from 'vitest';
import { extractContent, isSupportedFileType, getExtractorForType } from './index';

describe('extractContent', () => {
  it('should extract text files', async () => {
    const buffer = Buffer.from('Hello world', 'utf-8');
    const result = await extractContent(buffer, 'txt');

    expect(result.text).toBe('Hello world');
  });

  it('should extract markdown files', async () => {
    const buffer = Buffer.from('# Title\n\nContent', 'utf-8');
    const result = await extractContent(buffer, 'md');

    expect(result.text).toBe('# Title\n\nContent');
  });

  it('should throw for unsupported file types', async () => {
    const buffer = Buffer.from('data', 'utf-8');

    await expect(extractContent(buffer, 'xyz')).rejects.toThrow('Unsupported file type');
  });

  it('should throw for docx (not yet implemented)', async () => {
    const buffer = Buffer.from('data', 'utf-8');

    await expect(extractContent(buffer, 'docx')).rejects.toThrow('not yet implemented');
  });
});

describe('isSupportedFileType', () => {
  it('should return true for supported types', () => {
    expect(isSupportedFileType('txt')).toBe(true);
    expect(isSupportedFileType('md')).toBe(true);
    expect(isSupportedFileType('pdf')).toBe(true);
  });

  it('should return false for unsupported types', () => {
    expect(isSupportedFileType('docx')).toBe(false); // Not yet implemented
    expect(isSupportedFileType('xlsx')).toBe(false);
    expect(isSupportedFileType('jpg')).toBe(false);
    expect(isSupportedFileType('')).toBe(false);
  });
});

describe('getExtractorForType', () => {
  it('should return extractor for supported types', () => {
    expect(getExtractorForType('txt')).toBeDefined();
    expect(getExtractorForType('md')).toBeDefined();
    expect(getExtractorForType('pdf')).toBeDefined();
  });

  it('should return undefined for unsupported types', () => {
    expect(getExtractorForType('xyz')).toBeUndefined();
  });
});
