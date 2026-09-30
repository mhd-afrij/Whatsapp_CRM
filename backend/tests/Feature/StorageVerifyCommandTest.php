<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The container entrypoint runs `php artisan storage:verify` before booting
 * the API, worker and scheduler. A storage misconfiguration (FILESYSTEM_DISK
 * pointing at an undefined disk, or an azure disk with no credential) must
 * fail loudly at startup instead of surfacing hours later as failed uploads.
 */
class StorageVerifyCommandTest extends TestCase
{
    public function test_it_passes_for_the_ordinary_local_setup(): void
    {
        config(['filesystems.default' => 'local']);

        $this->artisan('storage:verify')->assertExitCode(0);
    }

    public function test_it_fails_when_the_default_disk_is_not_defined(): void
    {
        config(['filesystems.default' => 'minio']);

        $this->artisan('storage:verify')
            ->expectsOutputToContain("no such disk is defined")
            ->assertExitCode(1);
    }

    public function test_it_fails_when_the_azure_disk_has_no_credential(): void
    {
        config([
            'filesystems.default' => 'azure',
            'filesystems.disks.azure' => [
                'driver' => 'azure-storage-blob',
                'container' => 'whatsapp-media',
            ],
        ]);

        $this->artisan('storage:verify')
            ->expectsOutputToContain('no usable credential')
            ->assertExitCode(1);
    }

    public function test_it_fails_when_the_azure_disk_has_no_container(): void
    {
        config([
            'filesystems.default' => 'azure',
            'filesystems.disks.azure' => [
                'driver' => 'azure-storage-blob',
                'connection_string' => 'UseDevelopmentStorage=true',
            ],
        ]);

        $this->artisan('storage:verify')
            ->expectsOutputToContain('no container')
            ->assertExitCode(1);
    }

    public function test_it_passes_for_a_fully_configured_azure_disk(): void
    {
        config([
            'filesystems.default' => 'azure',
            'filesystems.disks.azure' => [
                'driver' => 'azure-storage-blob',
                'connection_string' => 'DefaultEndpointsProtocol=https;AccountName=a;AccountKey='.base64_encode('k'),
                'container' => 'whatsapp-media',
            ],
        ]);
        Storage::fake('azure');

        $this->artisan('storage:verify')
            ->expectsOutputToContain('Storage configuration is consistent')
            ->assertExitCode(0);
    }
}
