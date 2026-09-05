# Shared by start.sh and worker.sh. Fills APP_URL from the hosting platform when it is not set.
if [ -z "$APP_URL" ] && [ -n "$RENDER_EXTERNAL_URL" ]; then export APP_URL="$RENDER_EXTERNAL_URL"; fi
if [ -z "$APP_URL" ] && [ -n "$RAILWAY_PUBLIC_DOMAIN" ]; then export APP_URL="https://$RAILWAY_PUBLIC_DOMAIN"; fi
if [ -z "$APP_URL" ] && [ -n "$FLY_APP_NAME" ]; then export APP_URL="https://$FLY_APP_NAME.fly.dev"; fi
export APP_URL="${APP_URL:-http://localhost:3000}"
export STORAGE_DRIVER="${STORAGE_DRIVER:-local}"
export EMAIL_PROVIDER="${EMAIL_PROVIDER:-console}"
