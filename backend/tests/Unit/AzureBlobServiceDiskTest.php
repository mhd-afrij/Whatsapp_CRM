<?php

namespace Tests\Unit;

use App\Services\AzureBlobService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * FILESYSTEM_DISK must actually decide where uploads and exports land.
 *
 * Regression cover for the bug where AzureBlobService hard-coded the 'public'
 * and 'local' disk names, so FILESYSTEM_DISK=azure configured an 'azure' disk
 * that nothing ever used and every file silently went to local disk.
 */
class AzureBlobServiceDiskTest extends TestCase
{
    public function test_local_default_keeps_the_public_private_split(): void
    {
        config(['filesystems.default' => 'local']);
        Storage::fake('public');
        Storage::fake('local');

        $service = new AzureBlobService;

        $logo = $service->upload(UploadedFile::fake()->image('logo.png'), 'workspace-logos/1');
        $export = $service->uploadContent('a,b', 'exports/1/report.csv', 'text/csv');

        Storage::disk('public')->assertExists($logo['file_path']);
        Storage::disk('local')->assertExists($export['file_path']);
        $this->assertSame('local', $logo['storage_provider']);
    }

    public function test_azure_default_routes_both_roles_to_the_azure_disk(): void
    {
        config(['filesystems.default' => 'azure', 'filesystems.disks.azure.driver' => 'azure-storage-blob']);
        Storage::fake('azure');

        $service = new AzureBlobService;

        $logo = $service->upload(UploadedFile::fake()->image('logo.png'), 'workspace-logos/1');
        $export = $service->uploadContent('a,b', 'exports/1/report.csv', 'text/csv');

        // The old behaviour put these on 'public'/'local' instead.
        Storage::disk('azure')->assertExists($logo['file_path']);
        Storage::disk('azure')->assertExists($export['file_path']);
        $this->assertSame('azure-storage-blob', $logo['storage_provider']);
        $this->assertSame('azure-storage-blob', $export['storage_provider']);
    }

    public function test_azure_default_resolves_exists_delete_and_download_on_the_azure_disk(): void
    {
        config(['filesystems.default' => 'azure', 'filesystems.disks.azure.driver' => 'azure-storage-blob']);
        Storage::fake('azure');

        $service = new AzureBlobService;
        $path = $service->uploadContent('a,b', 'exports/1/report.csv', 'text/csv')['file_path'];

        $this->assertTrue($service->exists($path));
        $this->assertSame('a,b', $service->download($path));
        $this->assertTrue($service->delete($path));
        $this->assertFalse($service->exists($path));
    }

    public function test_a_failed_write_is_raised_not_reported_as_success(): void
    {
        config(['filesystems.default' => 'azure', 'filesystems.disks.azure.driver' => 'azure-storage-blob']);
        Storage::fake('azure');
        // 'throw' => false on the azure disk makes a failed put() return false;
        // the export must not be recorded as 'ready' when that happens.
        Storage::shouldReceive('disk')->andReturnUsing(fn () => new class
        {
            public function put($path, $content)
            {
                return false;
            }
        });

        $this->expectException(\RuntimeException::class);

        (new AzureBlobService)->uploadContent('a,b', 'exports/1/report.csv', 'text/csv');
    }

    public function test_url_for_an_azure_disk_is_a_temporary_sas_not_a_plain_url(): void
    {
        // A private Azure container 403s every unsigned url(), so a plain link
        // would render as a broken image in the sidebar forever.
        config(['filesystems.default' => 'azure', 'filesystems.disks.azure.driver' => 'azure-storage-blob']);
        Storage::fake('azure');
        Storage::disk('azure')->put('workspace-logos/1/logo.png', 'x');

        $disk = Storage::disk('azure');
        $temporary = \Mockery::mock($disk)->makePartial();
        $temporary->shouldReceive('providesTemporaryUrls')->andReturnTrue();
        $temporary->shouldReceive('temporaryUrl')->once()->andReturn('https://acct.blob.core.windows.net/whatsapp-media/workspace-logos/1/logo.png?sig=SAS');
        Storage::shouldReceive('disk')->with('azure')->andReturn($temporary);

        $this->assertStringContainsString('sig=SAS', (new AzureBlobService)->getUrl('workspace-logos/1/logo.png'));
    }

    public function test_url_for_a_local_disk_still_uses_the_plain_url(): void
    {
        // Laravel's local disk also reports providesTemporaryUrls() === true
        // (it signs ?expiration=), so the Azure branch must be keyed on the
        // driver - local uploads must keep the plain /storage/... URL.
        config(['filesystems.default' => 'local']);
        Storage::fake('public');
        Storage::disk('public')->put('workspace-logos/1/logo.png', 'x');

        $this->assertStringEndsWith(
            '/storage/workspace-logos/1/logo.png',
            (new AzureBlobService)->getUrl('workspace-logos/1/logo.png'),
        );
    }
}
