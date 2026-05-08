FROM mysql:8.0
EXPOSE 3306
# Add a database & root password
ENV MYSQL_ROOT_PASSWORD testingpassword  
ENV MYSQL_DATABASE KuoteSuite
ENV MYSQL_USER users 
ENV MYSQL_PASSWORD testingpassword

# optionnaly, run initial scripts for creating tables 
ADD sql-scripts/setup.sql /docker-entrypoint-initdb.d

#docker exec -it database-container bash
#mysql -u root -p
#testingpassword
#show databases;
#use KuoteSuite
#show tables;