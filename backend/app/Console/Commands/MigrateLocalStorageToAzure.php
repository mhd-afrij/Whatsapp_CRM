<?php

namespace App\Console\Commands;

use App\Services\AzureBlobService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Migration command to inventory and upload any historical local user files
 * (workspace logos, report exports) to Azure Blob Storage idempotently.
 *
 * Usage:
 *   php artisan storage:migrate-to-azure [--dry-run]
 */
class MigrateLocalStorageToAzure extends Command
{
    protected $signature = 'storage:migrate-to-azure {--dry-run : Inventory and verify files without uploading}';

    protected $description = 'Idempotently migrate historical local application files to Azure Blob Storage';

    public function handle(AzureBlobService $azure): int
    {
        $dryRun = (bool) $this->option('dry-run');

        if ($dryRun) {
            $this->warn('DRY RUN MODE: No files will be uploaded or modified.');
        }

        $localRoots = [
            'public' => storage_path('app/public'),
            'private' => storage_path('app/private'),
        ];

        $totalMigrated = 0;
        $totalFailed = 0;
        $totalSkipped = 0;

        foreach ($localRoots as $role => $rootPath) {
            if (! File::isDirectory($rootPath)) {
                $this->line("Directory does not exist, skipping: {$rootPath}");
                continue;
            }

            $files = File::allFiles($rootPath);
            $this->info("Scanning [{$role}] files in: {$rootPath} (found ".count($files).")");

            foreach ($files as $file) {
                $relativePath = str_replace('\\', '/', $file->getRelativePathname());

                // Skip .gitignore
                if ($file->getFilename() === '.gitignore') {
                    continue;
                }

                $size = $file->getSize();
                $this->line(" - Processing: {$relativePath} ({$size} bytes)");

                // Target Azure path matches relative path
                $targetPath = $relativePath;

                // Check if already in Azure
                if ($azure->exists($targetPath)) {
                    $this->comment("   Already present in Azure: {$targetPath} (skipped)");
                    $totalSkipped++;
                    continue;
                }

                if ($dryRun) {
                    $this->info("   [Dry Run] Would upload: {$relativePath} -> Azure [{$targetPath}]");
                    $totalMigrated++;
                    continue;
                }

                try {
                    $content = File::get($file->getRealPath());
                    $mime = File::mimeType($file->getRealPath()) ?: 'application/octet-stream';

                    $res = $azure->uploadContent($content, $targetPath, $mime);

                    // Verify size
                    if ($azure->exists($targetPath)) {
                        $this->info("   Successfully uploaded and verified: {$targetPath}");
                        $totalMigrated++;
                    } else {
                        $this->error("   Upload verification failed for: {$targetPath}");
                        $totalFailed++;
                    }
                } catch (Throwable $e) {
                    $this->error("   Failed to upload {$relativePath}: ".$e->getMessage());
                    $totalFailed++;
                }
            }
        }

        $this->newLine();
        $this->info("Migration Summary: {$totalMigrated} migrated, {$totalSkipped} already in Azure, {$totalFailed} failed.");

        return $totalFailed > 0 ? self::FAILURE : self::SUCCESS;
    }
}

