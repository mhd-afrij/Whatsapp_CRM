# Backend (Laravel 12) - PHP-FPM based image
FROM php:8.2-fpm-alpine AS base

RUN apk add --no-cache \
    bash git curl libpng-dev libzip-dev zip unzip oniguruma-dev mysql-client \
    && docker-php-ext-install pdo_mysql mbstring zip gd bcmath opcache

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

EXPOSE 8000
CMD ["/usr/local/bin/start.sh"]
