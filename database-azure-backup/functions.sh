#!/bin/bash

set -e

DATETIME=$(date +"%Y-%m-%d_%H")

if [ "$POSTGRES_HOST" == "" ]; then
    export POSTGRES_HOST="postgres";
fi

if [ "$POSTGRES_PORT" == "" ]; then
    export POSTGRES_PORT="5432";
fi

if [ "$FILENAME" == "" ]; then
    export FILENAME="default";
fi

if [ "$NO_PASSWORD" == "" ]; then
    export NO_PASSWORD="false";
fi

make_backup () {

    if [ "$DEBUG" == "true" ]; then
        echo "######################################"
        echo "FILENAME = $FILENAME"
        echo "CONTAINER = $CONTAINER"
        echo "POSTGRES_HOST = $POSTGRES_HOST"
        echo "POSTGRES_PORT = $POSTGRES_PORT"
        echo "DB_USER = $DB_USER"
        echo "DB_PASSWORD = $DB_PASSWORD"
        echo "AZURE_STORAGE_ACCOUNT = $AZURE_STORAGE_ACCOUNT"
        echo "AZURE_STORAGE_ACCESS_KEY = $AZURE_STORAGE_ACCESS_KEY "
        echo "DB_NAME = $DB_NAME"
        echo "######################################"
    fi

    BACKUP_FILE="$FILENAME-$DATETIME.sql"

    if [ "$NO_PASSWORD" == "true" ]; then

        pg_dump -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_FILE";

    else

        PGPASSWORD="$DB_PASSWORD" pg_dump -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_FILE";

    fi

    # compress the file
    gzip -9 "$BACKUP_FILE"
    # Send to cloud storage
    /usr/local/bin/azure storage blob upload "$BACKUP_FILE.gz" "$CONTAINER" -c "DefaultEndpointsProtocol=https;BlobEndpoint=https://$AZURE_STORAGE_ACCOUNT.blob.core.windows.net/;AccountName=$AZURE_STORAGE_ACCOUNT;AccountKey=$AZURE_STORAGE_ACCESS_KEY"

    # Remove file to save space
    rm -f ./*.sql.gz

}

make_backup;
