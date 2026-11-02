<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Storage abstraction for workspace assets (logos) and generated files
 * (report exports) backed by Supabase Storage (S3-compatible Flysystem API).
 *
 * Backed by Laravel's filesystem layer so tests can Storage::fake()
 * the underlying disks and production points FILESYSTEM_DISK at 's3' (Supabase).
 */
class SupabaseStorageService
{
    public const DISK_PUBLIC = 'public';

    public const DISK_PRIVATE = 'local';

    /**
     * Lifetime of a generated signed link, in minutes.
     */
    public const SIGNED_URL_TTL_MINUTES = 60;

    /**
     * Store raw generated content (e.g. a CSV export).
     *
     * @return array{file_path: string, file_url: string|null, storage_provider: string}
     */
    public function uploadContent(string $content, string $path, ?string $mime = null): array
    {
        $disk = $this->disk(self::DISK_PRIVATE);

        if (! Storage::disk($disk)->put($path, $content)) {
            throw new RuntimeException("Failed to write [{$path}] to the [{$disk}] disk.");
        }

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
        $disk = $this->disk(self::DISK_PUBLIC);

        $path = $file->store($directory, $disk);

        if (! $path) {
            throw new RuntimeException("Failed to store the uploaded file on the [{$disk}] disk.");
        }

        return [
            'file_path' => $path,
            'file_url' => $this->getUrl($path),
            'storage_provider' => $this->provider($disk),
        ];
    }

    public function delete(string $path): bool
    {
        foreach ($this->disks() as $disk) {
            if (Storage::disk($disk)->exists($path)) {
                return Storage::disk($disk)->delete($path);
            }
        }

        return false;
    }

    public function getUrl(string $path): string
    {
        $name = $this->disk(self::DISK_PUBLIC);
        $disk = Storage::disk($name);

        if ($this->provider($name) === 's3' && $disk->providesTemporaryUrls()) {
            return $disk->temporaryUrl($path, now()->addMinutes(self::SIGNED_URL_TTL_MINUTES));
        }

        return $disk->url($path);
    }

    public function exists(string $path): bool
    {
        foreach ($this->disks() as $disk) {
            if (Storage::disk($disk)->exists($path)) {
                return true;
            }
        }

        return false;
    }

    /** Raw file contents (private exports live on the private disk). */
    public function download(string $path): string
    {
        return (string) Storage::disk($this->disk(self::DISK_PRIVATE))->get($path);
    }

    /**
     * The disk backing one of the two roles. FILESYSTEM_DISK must resolve to 's3'.
     * Local storage fallback is prohibited in production.
     */
    protected function disk(string $localRole): string
    {
        $default = (string) config('filesystems.default');

        if ($default === 'local' && app()->environment() !== 'testing') {
            throw new RuntimeException("FILESYSTEM_DISK must be set to 's3' (Supabase Storage). Local disk is disabled for persistent application files.");
        }

        return $default === 'local' ? $localRole : $default;
    }

    /** Both role disks, de-duplicated. */
    protected function disks(): array
    {
        return array_values(array_unique([
            $this->disk(self::DISK_PUBLIC),
            $this->disk(self::DISK_PRIVATE),
        ]));
    }

    protected function provider(string $disk): string
    {
        return (string) config("filesystems.disks.{$disk}.driver", $disk);
    }
}

