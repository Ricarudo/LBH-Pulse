var createError = require('http-errors');
const express = require('express');
const cors = require('cors');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
require('dotenv').config(); // handles our .env variables
const prisma = require('./config/prisma');

const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 4200);
const FRONTEND_HOST = process.env.FRONTEND_HOST || 'localhost';
const FRONTEND_API = process.env.FRONTEND || `http://${FRONTEND_HOST}:${FRONTEND_PORT}`;

var app = express();
// NOTE: bin/www owns server startup. Keeping app.listen out of this module
// lets tests import the Express app without creating a second listener.
app.use(express.json());

// CORS
var corsOptions = {
    origin: FRONTEND_API,
    methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'PATCH']
};
app.use(cors(corsOptions));

// REST API endpoints
app.use('/users/', require('./routes/users'));
app.use('/quotes/', require('./routes/quotes'));
app.use('/leads/', require('./routes/leads'));
app.use('/items/', require('./routes/items'));
app.use('/clients/', require('./routes/clients'));
app.use('/suppliers/', require('./routes/suppliers'));

// TODO: Add backend JWT validation middleware here before company-network use.
// The current local-development login is frontend-only and does not protect API routes.
app.get('/auth/status', (req, res) => {
    res.json({
        mode: 'local-development',
        authenticated: false,
        message: 'Local development login is handled by the Angular frontend. API routes are not protected yet.'
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/health/database', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', database: 'postgres' });
    } catch (err) {
        res.status(503).json({
            status: 'unavailable',
            database: 'postgres',
            errors: err.message || err
        });
    }
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(400));
});

// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
