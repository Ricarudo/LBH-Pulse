#!/bin/bash

set -e

if [ "$BACKUP_WINDOW" == "" ]; then

    BACKUP_WINDOW="0 6 * * * ";

fi

if  [ "$ONE_SHOOT" == "true" ]; then

    /backup/functions.sh;
    exit 0

else

    touch /var/log/cron.log;
    echo "$BACKUP_WINDOW /backup/functions.sh >> /var/log/cron.log 2>&1" > job;
    echo "" >> job
    crontab job; cron;
    tail -f /var/log/cron.log;
    exit $?

fi
