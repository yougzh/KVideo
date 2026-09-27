import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { open, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

interface MediaSegment {
  url: string;
  key: KeyInfo | null;
  sequence: number;
}

interface KeyInfo {
  method: 'AES-128';
  uri: string;
  iv?: Uint8Array;
}

interface ParsedPlaylist {
  initUrl: string | null;
  initKey: KeyInfo | null;
  segments: MediaSegment[];
}

interface PlaylistProbe {
  segments: number;
  encrypted: boolean;
  supported: true;
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
  Accept: '*/*',
};
const MAX_PLAYLIST_DEPTH = 3;
const MAX_SEGMENTS = 20000;
const keyCache = new Map<string, Promise<Uint8Array>>();

function resolveUrl(baseUrl: string, target: string): string {
  try {
    return new URL(target, baseUrl).toString();
  } catch {
    return target;
  }
}

function parseIv(value: string | undefined): Uint8Array | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replace(/^0x/i, '');
  if (!/^[0-9a-f]{32}$/i.test(normalized)) return undefined;
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    bytes[index] = parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function parseAttributeList(value: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const regex = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    attributes[match[1].toUpperCase()] = match[2].replace(/^"|"$/g, '');
  }
  return attributes;
}

function sequenceIv(sequence: number): Uint8Array {
  const iv = new Uint8Array(16);
  const view = new DataView(iv.buffer);
  view.setUint32(8, Math.floor(sequence / 0x100000000), false);
  view.setUint32(12, sequence >>> 0, false);
  return iv;
}

function parsePlaylist(text: string, baseUrl: string): ParsedPlaylist | { variantUrl: string } {
  const lines = text.split(/\r?\n/);
  let mediaSequence = 0;
  let currentKey: KeyInfo | null = null;
  let initUrl: string | null = null;
  let initKey: KeyInfo | null = null;
  const segments: MediaSegment[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    if (line.startsWith('#EXT-X-STREAM-INF')) {
      for (let next = index + 1; next < lines.length; next += 1) {
        const candidate = lines[next].trim();
        if (!candidate || candidate.startsWith('#')) continue;
        return { variantUrl: resolveUrl(baseUrl, candidate) };
      }
      continue;
    }

    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = Number(line.slice('#EXT-X-MEDIA-SEQUENCE:'.length)) || 0;
      continue;
    }

    if (line.startsWith('#EXT-X-KEY:')) {
      const attributes = parseAttributeList(line.slice('#EXT-X-KEY:'.length));
      const method = (attributes.METHOD || '').toUpperCase();
      if (method === 'NONE') {
        currentKey = null;
        continue;
      }
      if (method !== 'AES-128') {
        throw new Error(`当前视频使用 ${method || '未知'} 加密，浏览器下载暂不支持`);
      }
      if (!attributes.URI) {
        throw new Error('加密播放列表缺少密钥地址');
      }
      currentKey = {
        method: 'AES-128',
        uri: resolveUrl(baseUrl, attributes.URI),
        iv: parseIv(attributes.IV),
      };
      continue;
    }

    if (line.startsWith('#EXT-X-MAP:')) {
      const attributes = parseAttributeList(line.slice('#EXT-X-MAP:'.length));
      if (attributes.URI) {
        initUrl = resolveUrl(baseUrl, attributes.URI);
        initKey = currentKey;
      }
      continue;
    }

    if (line.startsWith('#')) continue;

    segments.push({
      url: resolveUrl(baseUrl, line),
      key: currentKey,
      sequence: mediaSequence + segments.length,
    });
    if (segments.length > MAX_SEGMENTS) {
      throw new Error('视频分片数量过多，已停止下载');
    }
  }

  if (segments.length === 0) {
    throw new Error('播放列表中没有可下载的视频分片');
  }

  return { initUrl, initKey, segments };
}

async function fetchResource(url: string): Promise<Response> {
  const parsed = new URL(url);
  const origin = parsed.origin;
  const response = await fetch(url, {
    headers: {
      ...FETCH_HEADERS,
      Referer: `${origin}/`,
      Origin: origin,
    },
  });
  if (!response.ok) {
    throw new Error(`下载失败：HTTP ${response.status}`);
  }
  return response;
}

async function parsePlaylistFromUrl(url: string, depth = 0): Promise<ParsedPlaylist> {
  if (depth > MAX_PLAYLIST_DEPTH) {
    throw new Error('播放列表层级过深');
  }
  const response = await fetchResource(url);
  const text = await response.text();
  const parsed = parsePlaylist(text, url);
  if ('variantUrl' in parsed) {
    return parsePlaylistFromUrl(parsed.variantUrl, depth + 1);
  }
  return parsed;
}

async function getKey(key: KeyInfo): Promise<Uint8Array> {
  const cached = keyCache.get(key.uri);
  if (cached) return cached;

  const request = fetchResource(key.uri)
    .then(response => response.arrayBuffer())
    .then(buffer => new Uint8Array(buffer));
  keyCache.set(key.uri, request);
  try {
    return await request;
  } catch (error) {
    keyCache.delete(key.uri);
    throw error;
  }
}

async function decryptSegment(data: ArrayBuffer, keyInfo: KeyInfo, sequence: number): Promise<ArrayBuffer> {
  const key = await getKey(keyInfo);
  if (key.byteLength !== 16) {
    throw new Error('AES-128 密钥长度无效');
  }
  const keyBytes = new Uint8Array(key).slice().buffer;
  const ivBytes = new Uint8Array(keyInfo.iv || sequenceIv(sequence)).slice();
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
  return crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: ivBytes },
    cryptoKey,
    data
  );
}

async function loadSegment(segment: MediaSegment): Promise<ArrayBuffer> {
  const response = await fetchResource(segment.url);
  const data = await response.arrayBuffer();
  return segment.key
    ? decryptSegment(data, segment.key, segment.sequence)
    : data;
}

function buildDownloadHeaders(filename: string, contentLength: number): Headers {
  const headers = new Headers();
  const safeName = filename.replace(/[\r\n"]/g, '_');
  headers.set('Content-Type', 'video/mp2t');
  headers.set('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  headers.set('Content-Length', String(contentLength));
  headers.set('Cache-Control', 'no-store');
  headers.set('Access-Control-Allow-Origin', '*');
  return headers;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const filename = request.nextUrl.searchParams.get('filename') || 'video.ts';
  const probe = request.nextUrl.searchParams.get('probe') === '1';

  if (!url) {
    return NextResponse.json({ error: 'Missing URL parameter' }, { status: 400 });
  }

  try {
    const playlist = await parsePlaylistFromUrl(url);
    const encrypted = Boolean(
      playlist.initKey ||
      playlist.segments.some(segment => segment.key)
    );

    if (probe) {
      const result: PlaylistProbe = {
        segments: playlist.segments.length,
        encrypted,
        supported: true,
      };
      return NextResponse.json(result);
    }

    const tempPath = join(tmpdir(), `kvideo-download-${randomUUID()}.ts`);
    const file = await open(tempPath, 'w');
    try {
      if (playlist.initUrl) {
        const initResponse = await fetchResource(playlist.initUrl);
        const initData = await initResponse.arrayBuffer();
        const data = playlist.initKey
          ? await decryptSegment(initData, playlist.initKey, 0)
          : initData;
        await file.write(new Uint8Array(data));
      }

      for (const segment of playlist.segments) {
        const data = await loadSegment(segment);
        await file.write(new Uint8Array(data));
      }
      await file.close();
    } catch (error) {
      await file.close().catch(() => undefined);
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }

    const fileInfo = await stat(tempPath);
    const fileStream = createReadStream(tempPath);
    fileStream.once('close', () => {
      void unlink(tempPath).catch(() => undefined);
    });

    return new Response(Readable.toWeb(fileStream) as unknown as ReadableStream<Uint8Array>, {
      status: 200,
      headers: buildDownloadHeaders(filename, fileInfo.size),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '下载准备失败';
    return NextResponse.json({ error: message }, { status: 415 });
  }
}
