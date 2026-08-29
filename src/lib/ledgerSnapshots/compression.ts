/**
 * Bounded compression helpers for snapshot export/import.
 */

import { byteLength } from './canonicalize';

export interface CompressionResult {
  compressed: Uint8Array;
  uncompressedBytes: number;
  compressedBytes: number;
  algorithm: 'deflate-raw' | 'none';
}

export async function compressSnapshotPayload(json: string): Promise<CompressionResult> {
  const uncompressedBytes = byteLength(json);
  if (typeof CompressionStream === 'undefined') {
    const encoded = new TextEncoder().encode(json);
    return {
      compressed: encoded,
      uncompressedBytes,
      compressedBytes: encoded.byteLength,
      algorithm: 'none',
    };
  }

  const input = new Blob([json]).stream();
  const compressedStream = input.pipeThrough(new CompressionStream('deflate'));
  const buffer = await new Response(compressedStream).arrayBuffer();
  const compressed = new Uint8Array(buffer);

  return {
    compressed,
    uncompressedBytes,
    compressedBytes: compressed.byteLength,
    algorithm: 'deflate-raw',
  };
}

export async function decompressSnapshotPayload(
  data: Uint8Array,
  algorithm: CompressionResult['algorithm']
): Promise<string> {
  if (algorithm === 'none') {
    return new TextDecoder().decode(data);
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Decompression is not supported in this environment.');
  }

  const input = new Blob([Uint8Array.from(data)]).stream();
  const decompressedStream = input.pipeThrough(new DecompressionStream('deflate'));
  return new Response(decompressedStream).text();
}

export function uint8ToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i += 1) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface CompressedEnvelope {
  version: 1;
  algorithm: CompressionResult['algorithm'];
  payloadBase64: string;
  uncompressedBytes: number;
}

export async function wrapCompressedJson(json: string): Promise<CompressedEnvelope> {
  const result = await compressSnapshotPayload(json);
  return {
    version: 1,
    algorithm: result.algorithm,
    payloadBase64: uint8ToBase64(result.compressed),
    uncompressedBytes: result.uncompressedBytes,
  };
}

export async function unwrapCompressedJson(envelope: CompressedEnvelope): Promise<string> {
  if (envelope.version !== 1) {
    throw new Error(`Unsupported compressed envelope version: ${envelope.version}`);
  }
  const bytes = base64ToUint8(envelope.payloadBase64);
  return decompressSnapshotPayload(bytes, envelope.algorithm);
}
