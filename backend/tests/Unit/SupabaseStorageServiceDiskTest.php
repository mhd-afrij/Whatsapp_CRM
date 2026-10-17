<?php

namespace Tests\Unit;

use App\Services\SupabaseStorageService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * FILESYSTEM_DISK decides where uploads and exports land.
 */
class SupabaseStorageServiceDiskTest extends TestCase
{
    public function test_local_default_keeps_the_public_private_split(): void
    {
        config(['filesystems.default' => 'local']);
        Storage::fake('public');
        Storage::fake('local');

        $service = new SupabaseStorageService;

        $logo = $service->upload(UploadedFile::fake()->image('logo.png'), 'workspace-logos/1');
        $export = $service->uploadContent('a,b', 'exports/1/report.csv', 'text/csv');

        Storage::disk('public')->assertExists($logo['file_path']);
        Storage::disk('local')->assertExists($export['file_path']);
        $this->assertSame('local', $logo['storage_provider']);
    }

    public function test_s3_default_routes_to_the_s3_disk(): void
    {
        config(['filesystems.default' => 's3', 'filesystems.disks.s3.driver' => 's3']);
        Storage::fake('s3');

        $service = new SupabaseStorageService;

        $logo = $service->upload(UploadedFile::fake()->image('logo.png'), 'workspace-logos/1');
        $export = $service->uploadContent('a,b', 'exports/1/report.csv', 'text/csv');

        Storage::disk('s3')->assertExists($logo['file_path']);
        Storage::disk('s3')->assertExists($export['file_path']);
        $this->assertSame('s3', $logo['storage_provider']);
        $this->assertSame('s3', $export['storage_provider']);
    }

    public function test_s3_default_resolves_exists_delete_and_download_on_s3(): void
    {
        config(['filesystems.default' => 's3', 'filesystems.disks.s3.driver' => 's3']);
        Storage::fake('s3');

        $service = new SupabaseStorageService;
        $path = $service->uploadContent('a,b', 'exports/1/report.csv', 'text/csv')['file_path'];

        $this->assertTrue($service->exists($path));
        $this->assertSame('a,b', $service->download($path));
        $this->assertTrue($service->delete($path));
        $this->assertFalse($service->exists($path));
    }

    public function test_a_failed_write_is_raised_not_reported_as_success(): void
    {
        config(['filesystems.default' => 's3', 'filesystems.disks.s3.driver' => 's3']);
        Storage::fake('s3');

        Storage::shouldReceive('disk')->andReturnUsing(fn () => new class
        {
            public function put($path, $content)
            {
                return false;
            }
        });

        $this->expectException(\RuntimeException::class);

        (new SupabaseStorageService)->uploadContent('a,b', 'exports/1/report.csv', 'text/csv');
    }

    public function test_url_for_s3_disk_is_a_temporary_url(): void
    {
        config(['filesystems.default' => 's3', 'filesystems.disks.s3.driver' => 's3']);
        Storage::fake('s3');
        Storage::disk('s3')->put('workspace-logos/1/logo.png', 'x');

        $disk = Storage::disk('s3');
        $temporary = \Mockery::mock($disk)->makePartial();
        $temporary->shouldReceive('providesTemporaryUrls')->andReturnTrue();
        $temporary->shouldReceive('temporaryUrl')->once()->andReturn('https://project.supabase.co/storage/v1/s3/whatsapp-media/workspace-logos/1/logo.png?token=signed');
        Storage::shouldReceive('disk')->with('s3')->andReturn($temporary);

        $this->assertStringContainsString('token=signed', (new SupabaseStorageService)->getUrl('workspace-logos/1/logo.png'));
    }

    public function test_url_for_a_local_disk_still_uses_the_plain_url(): void
    {
        config(['filesystems.default' => 'local']);
        Storage::fake('public');
        Storage::disk('public')->put('workspace-logos/1/logo.png', 'x');

        $this->assertStringEndsWith(
            '/storage/workspace-logos/1/logo.png',
            (new SupabaseStorageService)->getUrl('workspace-logos/1/logo.png'),
        );
    }
}

