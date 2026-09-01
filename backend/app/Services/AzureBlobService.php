<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Storage abstraction for workspace assets (logos) and generated files
 * (report exports). Backed by Laravel's filesystem layer so tests can
 * Storage::fake() the underlying disks and production can point
 * FILESYSTEM_DISK at any Flysystem driver (local, s3/minio, azure) without
 * touching calling code.
 *
 * Disk layout:
 *  - 'public'  → user-uploaded assets (workspace logos); URLs are resolvable.
 *  - 'local'   → private generated content (CSV exports); only reachable via
 *                authenticated controller actions, never public URLs.
 */
class AzureBlobService
{
    public const DISK_PUBLIC = 'public';

    public const DISK_PRIVATE = 'local';

    /**
     * Store raw generated content (e.g. a CSV export).
     *
     * @return array{file_path: string, file_url: string|null, storage_provider: string}
     */
    public function uploadContent(string $content, string $path, ?string $mime = null): array
    {
        $disk = self::DISK_PRIVATE;

        Storage::disk($disk)->put($path, $content);

        return [
            'file_path' => $path,
            'file_url' => null,
            'storage_provider' => $this->provider($disk),
        ];
    }

    /**
     * Store an uploaded file under a directory prefix.
     *
     * @return array{file_path: string, file_url: string|null, storage_provider: string}
     */
    public function upload(UploadedFile $file, string $directory): array
    {
        $disk = self::DISK_PUBLIC;

        $path = $file->store($directory, $disk);

        return [
            'file_path' => $path,
            'file_url' => $this->getUrl($path),
            'storage_provider' => $this->provider($disk),
        ];
    }

    public function delete(string $path): bool
    {
        // Try the public disk first (assets), then private (generated files);
        // callers treat this as best-effort cleanup.
        foreach ([self::DISK_PUBLIC, self::DISK_PRIVATE] as $disk) {
            if (Storage::disk($disk)->exists($path)) {
                return Storage::disk($disk)->delete($path);
            }
        }

        return false;
    }

    public function getUrl(string $path): string
    {
        return Storage::disk(self::DISK_PUBLIC)->url($path);
    }

    public function exists(string $path): bool
    {
        foreach ([self::DISK_PRIVATE, self::DISK_PUBLIC] as $disk) {
            if (Storage::disk($disk)->exists($path)) {
                return true;
            }
        }

        return false;
    }

    /** Raw file contents (private exports live on the local disk). */
    public function download(string $path): string
    {
        return (string) Storage::disk(self::DISK_PRIVATE)->get($path);
    }

    protected function provider(string $disk): string
    {
        return (string) config("filesystems.disks.{$disk}.driver", $disk);
    }
}
