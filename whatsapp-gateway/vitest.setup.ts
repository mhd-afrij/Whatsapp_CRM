process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '6379';
process.env.MYSQL_HOST = '127.0.0.1';
process.env.MYSQL_PORT = '3306';
process.env.MYSQL_DATABASE = 'crm_whatsapp_test';
process.env.MYSQL_USER = 'root';
process.env.MYSQL_PASSWORD = '';
process.env.LARAVEL_INTERNAL_API_URL = 'http://localhost:8000/api/internal';
process.env.INTERNAL_SHARED_SECRET = 'test-shared-secret';
process.env.SOCKET_CORS_ORIGIN = 'http://localhost:8000';
process.env.WHATSAPP_SESSION_DIR = './sessions-test';
process.env.INTERNAL_GATEWAY_TOKEN = 'test-internal-gateway-token';
process.env.CREDENTIALS_ENCRYPTION_KEY = '0'.repeat(64);
process.env.WHATSAPP_WORKSPACE_ID = '1';
process.env.SESSION_LOCK_ENABLED = 'false';
process.env.GATEWAY_INSTANCE_ID = 'test-instance';
process.env.SESSION_LEASE_MS = '30000';
process.env.SESSION_HEARTBEAT_INTERVAL_MS = '10000';
process.env.LOG_LEVEL = 'silent';
process.env.AZURE_STORAGE_URL_EXPIRY_SECONDS = '300';
// Deterministic storage mode for tests: object storage must default to the
// local-disk driver unless a test explicitly opts into S3 mode. Without this,
// a developer's .env leaking S3_* values into the shell flips media access
// into signed-URL mode and breaks local-file expectations.
delete process.env.S3_BUCKET;
delete process.env.S3_ENDPOINT;
delete process.env.S3_ACCESS_KEY_ID;
delete process.env.S3_SECRET_ACCESS_KEY;