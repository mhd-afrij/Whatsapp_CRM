<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Startup guard for storage configuration drift.
 *
 * The backend (FILESYSTEM_DISK) and the WhatsApp gateway (STORAGE_PROVIDER)
 * both use Supabase Storage (bucket: whatsapp-media).
 *
 * This command verifies the backend's own configuration is
 * self-consistent AND usable - the disk named by FILESYSTEM_DISK exists, its
 * driver matches 's3', and Supabase S3 credentials/endpoints are set.
 *
 * Run it with: php artisan storage:verify
 */
class VerifyStorageConfig extends Command
{
    protected $signature = 'storage:verify';

    protected $description = 'Verify the configured filesystem disk is consistent and usable at startup';

    public function handle(): int
    {
        $diskName = (string) config('filesystems.default');
        $config = config("filesystems.disks.{$diskName}");

        if (! is_array($config)) {
            $this->error("FILESYSTEM_DISK is '{$diskName}' but no such disk is defined in config/filesystems.php.");
            $this->error('Set FILESYSTEM_DISK to a disk that exists, or define it in config/filesystems.php.');

            return self::FAILURE;
        }

        $driver = (string) ($config['driver'] ?? '');

        $this->line("  disk   : {$diskName}");
        $this->line("  driver : {$driver}");

        if ($diskName !== 's3' && app()->environment() !== 'testing') {
            $this->error("FILESYSTEM_DISK is set to '{$diskName}'. Only 's3' (Supabase Storage) is permitted for persistent application files.");
            return self::FAILURE;
        }

        if ($driver === 's3' && app()->environment() !== 'testing') {
            $error = $this->checkS3Supabase($config);
            if ($error !== null) {
                $this->error($error);

                return self::FAILURE;
            }
        }

        // Resolving the disk proves the driver is registered and the config is shaped correctly.
        try {
            Storage::disk($diskName);
        } catch (Throwable $e) {
            $this->error('Could not resolve the '.$diskName.' disk: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info('Storage configuration is consistent.');

        return self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $config
     */
    protected function checkS3Supabase(array $config): ?string
    {
        $bucket = (string) ($config['bucket'] ?? '');
        if ($bucket === '') {
            return 'The s3 disk has no bucket. Set AWS_BUCKET or SUPABASE_STORAGE_BUCKET.';
        }

        $key = (string) ($config['key'] ?? '');
        $secret = (string) ($config['secret'] ?? '');
        if ($key === '' || $secret === '') {
            return 'The s3 disk has no credentials. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.';
        }

        $endpoint = (string) ($config['endpoint'] ?? '');
        if ($endpoint === '') {
            return 'The s3 disk has no endpoint. Set AWS_ENDPOINT to your Supabase S3 endpoint (https://<project-ref>.supabase.co/storage/v1/s3).';
        }

        $this->line("  supabase storage : bucket '{$bucket}' using endpoint {$endpoint}");

        return null;
    }
}
