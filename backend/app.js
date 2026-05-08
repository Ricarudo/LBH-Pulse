var createError = require('http-errors');
const express = require('express');
const cors = require('cors');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
require('dotenv').config(); // handles our .env variables
const msal = require('@azure/msal-node');

const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 4200);
const FRONTEND_HOST = process.env.FRONTEND_HOST || 'localhost';
const FRONTEND_API = process.env.FRONTEND || `http://${FRONTEND_HOST}:${FRONTEND_PORT}`;
const SERVER_PORT = Number(process.env.PORT || 3000);

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

// Authentication
const hasMsalConfig = Boolean(process.env.CLIENTID && process.env.AUTHORITY && process.env.CLIENTSECRET);
const config = {
    auth: {
        clientId: process.env.CLIENTID,
        authority: process.env.AUTHORITY,
        clientSecret: process.env.CLIENTSECRET
    },
    system: {
        loggerOptions: {
            loggerCallback(loglevel, message, containsPii) {
                console.log(message);
            },
            piiLoggingEnabled: false,
            logLevel: msal.LogLevel.Verbose
        }
    }
};

// Create the MSAL application object only when secrets are present. This keeps
// local installs/tests from crashing before auth configuration is available.
const cca = hasMsalConfig ? new msal.ConfidentialClientApplication(config) : null;

app.get('/login', (req, res) => {
    if (!cca) {
        return res.status(503).json({ error: 'Microsoft authentication is not configured.' });
    }

    const authCodeUrlParameters = {
        scopes: ['user.read'],
        redirectUri: `http://localhost:${SERVER_PORT}/auth_response`
    };

    // Get URL to sign user in and consent to scopes needed for application.
    cca.getAuthCodeUrl(authCodeUrlParameters).then((response) => {
        res.redirect(response);
    }).catch((error) => console.log(JSON.stringify(error)));
});

app.get('/auth_response', (req, res) => {
    if (!cca) {
        return res.status(503).json({ error: 'Microsoft authentication is not configured.' });
    }

    const tokenRequest = {
        code: req.query.code,
        scopes: ['user.read'],
        redirectUri: `http://localhost:${SERVER_PORT}/auth_response`
    };

    cca.acquireTokenByCode(tokenRequest).then((response) => {
        console.log('\nResponse: \n:', response);
        res.sendStatus(200);
    }).catch((error) => {
        console.log(error);
        res.status(500).send(error);
    });
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
