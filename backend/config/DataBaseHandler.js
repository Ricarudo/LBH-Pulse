var mysql = require("mysql");

function DataBaseHandler() {
    this.connection = null;
}

//Establish connection to database from backend
DataBaseHandler.prototype.createConnection = function () {

    console.log("Trying to connect to database.");
    this.connection = mysql.createConnection({
        host: process.env.DATABASE_HOST || process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || process.env.MY_SQL_PWD || 'testingpassword',
        database: process.env.MYSQL_DATABASE || process.env.MYSQL_DB || process.env.DB_HOST || 'KuoteSuite',
        port: Number(process.env.MYSQL_PORT || process.env.DATABASE_PORT || 3306)
    });
    this.connection.connect(function (err) {
        if (err) {
            console.error("error connecting " + err.stack);
            return null;
        }
        console.log("Database connected");
    });
    return this.connection;
};

module.exports = DataBaseHandler;
