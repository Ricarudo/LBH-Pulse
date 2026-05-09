const { validationResult } = require('express-validator');

function asyncRoute(handler) {
    return async (req, res, next) => {
        try {
            await handler(req, res, next);
        } catch (err) {
            console.error(err);

            if (res.headersSent) {
                return next(err);
            }

            const status = err.status || 400;
            const message = err.code === 'P2025'
                ? 'Record not found'
                : err.message || err;

            return res.status(status).json({ errors: message });
        }
    };
}

function ensureValidRequest(req, res) {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return false;
    }

    return true;
}

function parseId(value, label) {
    const parsed = Number.parseInt(value, 10);

    if (Number.isNaN(parsed)) {
        const err = new Error(`Invalid ${label || 'id'}`);
        err.status = 400;
        throw err;
    }

    return parsed;
}

function nullableInt(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function nullableFloat(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function nullableString(value) {
    if (value === undefined || value === null) {
        return null;
    }

    return String(value);
}

function assertFound(record, message) {
    if (!record) {
        const err = new Error(message || 'Record not found');
        err.status = 400;
        throw err;
    }

    return record;
}

function assertChanged(result, message) {
    if (!result || result.count === 0) {
        const err = new Error(message || 'Record not found');
        err.status = 400;
        throw err;
    }
}

module.exports = {
    asyncRoute,
    ensureValidRequest,
    parseId,
    nullableFloat,
    nullableInt,
    nullableString,
    assertFound,
    assertChanged
};
