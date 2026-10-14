import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env';
import { getStorageClient } from '../lib/storage';
import { logger } from '../lib/logger';

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.json': 'application/json',
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

/**
 * Migration script to scan and upload historical local media files
 * from `whatsapp-gateway/media-storage/` into Azure Blob Storage.
 *
 * Usage:
 *   node dist/scripts/migrate-local-media-to-azure.js [--dry-run]
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    logger.info('Running in DRY-RUN mode. No files will be transferred.');
  }

  const mediaDir = path.resolve(env.MEDIA_LOCAL_STORAGE_DIR);

  try {
    await fs.access(mediaDir);
  } catch {
    logger.info({ mediaDir }, 'Local media directory does not exist or cannot be accessed. Nothing to migrate.');
    process.exit(0);
  }

  const storage = getStorageClient();

  async function* walk(dir: string, base: string = dir): AsyncGenerator<string> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* walk(fullPath, base);
      } else if (entry.isFile() && !entry.name.startsWith('.')) {
        yield fullPath;
      }
    }
  }

  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for await (const filePath of walk(mediaDir)) {
    const relativeKey = path.relative(mediaDir, filePath).replace(/\\/g, '/');

    try {
      const buffer = await fs.readFile(filePath);
      const mimeType = getMimeType(filePath);
      const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

      logger.info({ relativeKey, size: buffer.length, mimeType, checksum }, 'Inspecting file');

      if (dryRun) {
        logger.info({ relativeKey }, '[DRY RUN] Would upload to Azure Blob Storage');
        totalMigrated++;
        continue;
      }

      await storage.putObject(relativeKey, buffer, mimeType);

      // Verify read-back
      const downloaded = await storage.getObject(relativeKey);
      if (downloaded.length === buffer.length) {
        logger.info({ relativeKey }, 'Successfully uploaded and verified in Azure');
        totalMigrated++;
      } else {
        logger.error({ relativeKey }, 'Verification failed: size mismatch');
        totalFailed++;
      }
    } catch (err) {
      logger.error({ err, relativeKey }, 'Failed to migrate file to Azure');
      totalFailed++;
    }
  }

  logger.info({ totalMigrated, totalSkipped, totalFailed }, 'Migration finished');
  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err }, 'Fatal migration error');
  process.exit(1);
});

