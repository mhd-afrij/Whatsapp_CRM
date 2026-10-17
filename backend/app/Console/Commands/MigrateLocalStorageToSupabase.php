<?php

namespace App\Console\Commands;

use App\Services\SupabaseStorageService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Throwable;

/**
 * Migration command to inventory and upload any historical local user files
 * (workspace logos, report exports) to Supabase Storage idempotently.
 *
 * Usage:
 *   php artisan storage:migrate-to-supabase [--dry-run]
 */
class MigrateLocalStorageToSupabase extends Command
{
    protected $signature = 'storage:migrate-to-supabase {--dry-run : Inventory and verify files without uploading}';

    protected $description = 'Idempotently migrate historical local application files to Supabase Storage';

    public function handle(SupabaseStorageService $storage): int
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

                $targetPath = $relativePath;

                if ($storage->exists($targetPath)) {
                    $this->comment("   Already present in Supabase: {$targetPath} (skipped)");
                    $totalSkipped++;
                    continue;
                }

                if ($dryRun) {
                    $this->info("   [Dry Run] Would upload: {$relativePath} -> Supabase [{$targetPath}]");
                    $totalMigrated++;
                    continue;
                }

                try {
                    $content = File::get($file->getRealPath());
                    $mime = File::mimeType($file->getRealPath()) ?: 'application/octet-stream';

                    $storage->uploadContent($content, $targetPath, $mime);

                    if ($storage->exists($targetPath)) {
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
        $this->info("Migration Summary: {$totalMigrated} migrated, {$totalSkipped} already in Supabase, {$totalFailed} failed.");

        return $totalFailed > 0 ? self::FAILURE : self::SUCCESS;
    }
}

