# Run SQL in Container
## Required Env Vars.
---
> DATABASE_HOST
> DATABASE_PORT
> MY_SQL_PWD
```
mysql -uroot -p
password: {testingpassword}
```

After logging into mysql bash run:

```SQL
show databases;
use KuoteSuite;
show tables;
```