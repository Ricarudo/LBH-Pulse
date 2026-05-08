#!/bin/bash

MYSQL_ROOT_PASSWORD = "Blah"
export $MYSQL_ROOT_PASSWORD
#$DB_PWD = $MY_SQL_PWD
#echo $DB_PWD

#docker pull mysql/mysql-server:5.7
docker run --name=db-container -e $MYSQL_ROOT_PASSWORD --restart on-failure -d mysql/mysql-server:5.7

        #--mount type=bind,src=/path-on-host-machine/my.cnf,dst=/etc/my.cnf \
        #--mount type=bind,src=/path-on-host-machine/datadir,dst=/var/lib/mysql \
 

# docker run -it mysql/mysql-server --restart on-failure -d
#for M1 ARM Macs
#docker run --name=db_container --restart on-failure --platform linux/amd64 -d mysql/mysql-server:5.7

# log the container outputs
docker logs db-container
docker logs db-container 2>&1 | grep GENERATED

#docker exec -it db-container mysql -uroot -p #execute manually, corre container y especifica password que se generó

#ALTER USER 'root'@'localhost' IDENTIFIED BY $DB_PWD #execute manually

#docker exec -it db_container bash

