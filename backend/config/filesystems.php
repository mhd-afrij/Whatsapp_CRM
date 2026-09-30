<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp"
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
            'report' => false,
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => rtrim(env('APP_URL', 'http://localhost'), '/').'/storage',
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ],

        // Azure Blob Storage via azure-oss/storage-blob-laravel. Selected by
        // setting FILESYSTEM_DISK=azure (default disk). Auth uses the connection
        // string when present; the driver rejects connection_string combined
        // with account_name/credential, so shared-key fields are only passed
        // when there is no connection string. AZURE_STORAGE_URL (CDN/custom
        // domain) overrides generated URLs when set; private containers then
        // get SAS URLs from the adapter instead.
        'azure' => [
            'driver' => 'azure-storage-blob',
            ...((string) env('AZURE_STORAGE_CONNECTION_STRING') !== '' ? [
                'connection_string' => env('AZURE_STORAGE_CONNECTION_STRING'),
            ] : [
                'account_name' => env('AZURE_STORAGE_ACCOUNT_NAME'),
                'account_key' => env('AZURE_STORAGE_ACCOUNT_KEY'),
                'credential' => 'shared_key',
            ]),
            'container' => env('AZURE_STORAGE_CONTAINER_NAME', 'whatsapp-media'),
            'url' => env('AZURE_STORAGE_URL') ?: null,
            'timeout' => (int) env('AZURE_STORAGE_TIMEOUT', 30),
            'throw' => false,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
