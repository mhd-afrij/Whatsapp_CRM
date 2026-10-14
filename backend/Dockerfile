# Backend (Laravel 12) - PHP-FPM based image
FROM php:8.2-fpm-alpine AS base

# `redis` is REQUIRED, not optional: config/database.php defaults REDIS_CLIENT to
# `phpredis` and every env file pins it, so without this extension the queue
# worker and cache fail to boot with "The PhpRedis extension is not installed".
# The official php image does NOT bundle the redis extension source, so a plain
# `docker-php-ext-install redis` fails with "/usr/src/php/ext/redis does not
# exist"; install it from PECL instead (which needs the phpize toolchain, hence
# $PHPIZE_DEPS, removed again afterwards to keep the image lean).
RUN apk add --no-cache \
    bash git curl libpng-dev libzip-dev zip unzip oniguruma-dev mysql-client \
    $PHPIZE_DEPS \
    && docker-php-ext-install pdo_mysql mbstring zip gd bcmath opcache \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apk del --no-network $PHPIZE_DEPS

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --no-scripts --prefer-dist --optimize-autoloader || true

COPY . .
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

# LF line endings are required for the bash entrypoint (Windows checkouts
# otherwise break the container with "\r: command not found").
COPY docker/start.sh /usr/local/bin/start.sh
RUN sed -i 's/\r$//' /usr/local/bin/start.sh && chmod +x /usr/local/bin/start.sh

# Render entrypoint: dispatches web / worker / schedule / migrate roles. Used by
# render.yaml via dockerCommand; docker-compose keeps using start.sh above.
COPY docker/render-entrypoint.sh /usr/local/bin/render-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/render-entrypoint.sh && chmod +x /usr/local/bin/render-entrypoint.sh

EXPOSE 8000
CMD ["/usr/local/bin/start.sh"]
