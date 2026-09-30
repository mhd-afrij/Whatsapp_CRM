<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Startup guard for storage configuration drift.
 *
 * The backend (FILESYSTEM_DISK) and the WhatsApp gateway (STORAGE_PROVIDER)
 * each pick their own storage provider, and a mismatch is invisible until
 * media stops flowing: uploads land on one provider while readers look on the
 * other. Both providers are validated inside their own service, so a
 * disagreement can only be caught in the shared .env.
 *
 * This command therefore verifies the backend's own configuration is
 * self-consistent AND usable - the disk named by FILESYSTEM_DISK exists, its
 * driver matches, and an Azure disk is actually configured. It is wired into
 * the container entrypoint so a misconfigured deployment fails to boot loudly
 * instead of running for hours with broken uploads. It never contacts the
 * gateway, so the two services stay decoupled.
 *
 * Run it by hand with: php artisan storage:verify
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

        if ($driver === 'azure-storage-blob') {
            $error = $this->checkAzure($config);
            if ($error !== null) {
                $this->error($error);

                return self::FAILURE;
            }
        }

        // Resolving the disk proves the driver is registered and the config is
        // shaped correctly; without this a typo in the driver name only
        // surfaces on the first upload.
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
    protected function checkAzure(array $config): ?string
    {
        $container = (string) ($config['container'] ?? '');
        if ($container === '') {
            return 'The azure disk has no container. Set AZURE_STORAGE_CONTAINER_NAME.';
        }

        $hasConnectionString = is_string($config['connection_string'] ?? null) && $config['connection_string'] !== '';
        $hasSharedKey = ($config['account_name'] ?? null) && ($config['credential'] ?? null);

        if (! $hasConnectionString && ! $hasSharedKey) {
            return 'The azure disk has no usable credential. Set AZURE_STORAGE_CONNECTION_STRING.';
        }

        $configuredAccount = trim((string) env('AZURE_STORAGE_ACCOUNT_NAME'));
        $configuredUrl = trim((string) env('AZURE_STORAGE_URL'));
        if ($configuredAccount !== '' && $configuredUrl !== '') {
            $host = strtolower((string) parse_url($configuredUrl, PHP_URL_HOST));
            $expectedHost = strtolower($configuredAccount.'.blob.core.windows.net');
            if ($host !== '' && $host !== $expectedHost) {
                return 'Azure configuration drift: AZURE_STORAGE_URL does not match AZURE_STORAGE_ACCOUNT_NAME.';
            }
        }

        if ($hasConnectionString && preg_match('/(?:^|;)AccountName=([^;]+)/i', (string) $config['connection_string'], $match)) {
            if ($configuredAccount !== '' && ! hash_equals(strtolower($configuredAccount), strtolower(trim($match[1])))) {
                return 'Azure configuration drift: connection-string AccountName does not match AZURE_STORAGE_ACCOUNT_NAME.';
            }
        }

        $this->line("  azure  : container '{$container}' authenticated via ".($hasConnectionString ? 'connection string' : 'account key'));

        return null;
    }
}
