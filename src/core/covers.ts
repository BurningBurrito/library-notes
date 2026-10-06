import { App, TFile } from 'obsidian';
import { badResponse, httpRequest } from './http';
import { ensureFolder, joinPath } from './notes';
import type { ThrottleRule } from './throttle';

export type ImageExtension = 'jpg' | 'png' | 'webp' | 'gif';

export interface CoverImage {
	data: ArrayBuffer;
	extension: ImageExtension;
}

// Real covers are several KB; "no cover" placeholders (such as Open Library's
// 1×1 GIF) are tiny.
const MIN_COVER_BYTES = 1024;

/**
 * Download a cover image. Resolves with null when the source has no cover
 * (404, or something that isn't a real image), so the note is created without
 * one. Throws a BookError when the source can't be reached.
 */
export async function downloadCover(
	url: string,
	sourceName: string,
	throttle?: ThrottleRule,
): Promise<CoverImage | null> {
	const response = await httpRequest(url, { sourceName, throttle });
	if (response.status === 404 || response.status === 403) return null;
	if (response.status !== 200) throw badResponse(sourceName);
	const data = response.arrayBuffer;
	const extension = imageExtension(data);
	if (!extension || data.byteLength < MIN_COVER_BYTES) return null;
	return { data, extension };
}

/** Image type from the file's first bytes, not from what the server claims. */
export function imageExtension(data: ArrayBuffer): ImageExtension | null {
	const b = new Uint8Array(data.slice(0, 12));
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
	if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
	if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
	// "RIFF....WEBP"
	if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
		return 'webp';
	}
	return null;
}

/**
 * Save a cover in the covers folder. If a file with that name already exists
 * (the same book again), it's reused, never overwritten.
 */
export async function saveCover(app: App, folder: string, baseName: string, image: CoverImage): Promise<TFile> {
	const path = joinPath(folder, `${baseName}.${image.extension}`);
	const existing = app.vault.getFileByPath(path);
	if (existing) return existing;
	await ensureFolder(app, folder);
	return app.vault.createBinary(path, image.data);
}
