<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

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
 *
 * When FILESYSTEM_DISK names a non-local disk (e.g. 'azure') it becomes the
 * single backing store for both roles - the disk's own access control keeps
 * exports private, exactly as the local/private split did.
 */
class AzureBlobService
{
    public const DISK_PUBLIC = 'public';

    public const DISK_PRIVATE = 'local';

    /**
     * Lifetime of a generated SAS link, in minutes. Only the read permission
     * on the single blob being linked is granted.
     */
    public const SAS_TTL_MINUTES = 60;

    /**
     * Store raw generated content (e.g. a CSV export).
     *
     * @return array{file_path: string, file_url: string|null, storage_provider: string}
     */
    public function uploadContent(string $content, string $path, ?string $mime = null): array
    {
        $disk = $this->disk(self::DISK_PRIVATE);

        // The azure disk sets 'throw' => false, so a failed write returns false
        // instead of raising. Check it, otherwise the export is recorded as
        // 'ready' and only 404s much later at download time.
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
        // Try the public disk first (assets), then private (generated files);
        // callers treat this as best-effort cleanup.
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

        // A private Azure container answers 403 for every plain url(): with
        // AZURE_STORAGE_URL set the driver just concatenates an unsigned
        // path, so a stored logo_url would be dead on arrival. temporaryUrl()
        // is the only readable link the driver can produce - a short-lived,
        // read-only SAS scoped to this one blob and regenerated on each call,
        // so callers that fetch the workspace settings per page load never see
        // an expired link. Keyed on the driver rather than providesTemporaryUrls()
        // because Laravel's local disk reports true as well and must keep its
        // plain /storage/... URL.
        if ($this->provider($name) === 'azure-storage-blob' && $disk->providesTemporaryUrls()) {
            return $disk->temporaryUrl($path, now()->addMinutes(self::SAS_TTL_MINUTES));
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
     * The disk backing one of the two roles. FILESYSTEM_DISK wins whenever it
     * names a non-local disk; otherwise the stock local public/private split
     * is kept (which is also what the test suite fakes).
     */
    protected function disk(string $localRole): string
    {
        $default = (string) config('filesystems.default');

        return $default === 'local' ? $localRole : $default;
    }

    /** Both role disks, de-duplicated (they collapse to one under Azure). */
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
