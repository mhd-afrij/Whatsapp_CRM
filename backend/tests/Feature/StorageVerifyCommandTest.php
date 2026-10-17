<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The container entrypoint runs `php artisan storage:verify` before booting
 * the API, worker and scheduler. A storage misconfiguration (FILESYSTEM_DISK
 * pointing at an undefined disk, or an s3 disk with missing credentials) must
 * fail loudly at startup instead of surfacing hours later as failed uploads.
 */
class StorageVerifyCommandTest extends TestCase
{
    public function test_it_passes_for_the_ordinary_local_setup_in_testing(): void
    {
        config(['filesystems.default' => 'local']);

        $this->artisan('storage:verify')->assertExitCode(0);
    }

    public function test_it_fails_when_the_default_disk_is_not_defined(): void
    {
        config(['filesystems.default' => 'nonexistent']);

        $this->artisan('storage:verify')
            ->expectsOutputToContain('no such disk is defined')
            ->assertExitCode(1);
    }

    public function test_it_passes_for_configured_s3_disk(): void
    {
        config([
            'filesystems.default' => 's3',
            'filesystems.disks.s3' => [
                'driver' => 's3',
                'key' => 'test-key',
                'secret' => 'test-secret',
                'region' => 'auto',
                'bucket' => 'whatsapp-media',
                'endpoint' => 'https://test-ref.supabase.co/storage/v1/s3',
                'use_path_style_endpoint' => true,
            ],
        ]);
        Storage::fake('s3');

        $this->artisan('storage:verify')
            ->expectsOutputToContain('Storage configuration is consistent')
            ->assertExitCode(0);
    }
}
