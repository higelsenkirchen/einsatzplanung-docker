/**
 * Validation Middleware
 * Input-Validierung für API-Endpunkte
 */

const { body, query, param, validationResult } = require('express-validator');

// Validierungsfehler als Response senden
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validierungsfehler',
            details: errors.array().map(err => ({
                field: err.path,
                message: err.msg
            }))
        });
    }
    next();
};

// Event-Validierung
const validateEvent = [
    body('id').optional().isString().withMessage('ID muss ein String sein'),
    body('title').notEmpty().withMessage('Titel ist erforderlich')
        .isString().withMessage('Titel muss ein String sein')
        .isLength({ max: 255 }).withMessage('Titel max. 255 Zeichen'),
    body('start').notEmpty().withMessage('Startzeit ist erforderlich')
        .matches(/^\d{1,2}:\d{2}$/).withMessage('Startzeit Format: HH:MM'),
    body('end').notEmpty().withMessage('Endzeit ist erforderlich')
        .matches(/^\d{1,2}:\d{2}$/).withMessage('Endzeit Format: HH:MM'),
    body('dayIndex').isInt({ min: 0, max: 6 }).withMessage('dayIndex muss 0-6 sein'),
    body('extendedProps').optional().isObject().withMessage('extendedProps muss ein Objekt sein'),
    handleValidationErrors
];

// Pool-Item-Validierung
const validatePoolItem = [
    body('id').optional().isString().withMessage('ID muss ein String sein'),
    body('title').notEmpty().withMessage('Name ist erforderlich')
        .isString().withMessage('Name muss ein String sein')
        .isLength({ max: 255 }).withMessage('Name max. 255 Zeichen'),
    body('zone').optional().isString().withMessage('Zone muss ein String sein'),
    body('types').optional().isArray().withMessage('Types muss ein Array sein'),
    handleValidationErrors
];

// Tour-Validierung
const validateTour = [
    body('id').optional().isString().withMessage('ID muss ein String sein'),
    body('name').notEmpty().withMessage('Name ist erforderlich')
        .isString().withMessage('Name muss ein String sein')
        .isLength({ max: 100 }).withMessage('Name max. 100 Zeichen'),
    body('employeeId').optional().isString().withMessage('Employee-ID muss ein String sein'),
    handleValidationErrors
];

// Mitarbeiter-Validierung
const validateEmployee = [
    body('id').optional().isString().withMessage('ID muss ein String sein'),
    body('name').notEmpty().withMessage('Name ist erforderlich')
        .isString().withMessage('Name muss ein String sein')
        .isLength({ max: 255 }).withMessage('Name max. 255 Zeichen'),
    body('wageGroupId').optional().isString().withMessage('Gehaltsgruppe muss ein String sein'),
    body('homeZone').optional().isString().withMessage('Heimatzone muss ein String sein'),
    handleValidationErrors
];

// Varianten-Validierung
const validateVariant = [
    body('name').notEmpty().withMessage('Name ist erforderlich')
        .isString().withMessage('Name muss ein String sein')
        .isLength({ max: 255 }).withMessage('Name max. 255 Zeichen'),
    handleValidationErrors
];

// Varianten-ID-Validierung (für Query-Parameter)
const validateVariantId = [
    query('variantId').notEmpty().withMessage('variantId ist erforderlich')
        .isInt({ min: 1 }).withMessage('variantId muss eine positive Zahl sein'),
    handleValidationErrors
];

// Daten-Bulk-Validierung (für PUT /data)
const validateBulkData = [
    body('events').optional().isArray().withMessage('Events muss ein Array sein'),
    body('pool').optional().isArray().withMessage('Pool muss ein Array sein'),
    body('employees').optional().isArray().withMessage('Employees muss ein Array sein'),
    body('tours').optional().isArray().withMessage('Tours muss ein Array sein'),
    body('wageSettings').optional().isObject().withMessage('WageSettings muss ein Objekt sein'),
    handleValidationErrors
];

// Geocoding-Validierung
const validateGeocoding = [
    query('address').notEmpty().withMessage('Adresse ist erforderlich')
        .isString().withMessage('Adresse muss ein String sein')
        .isLength({ min: 3, max: 500 }).withMessage('Adresse zwischen 3 und 500 Zeichen'),
    handleValidationErrors
];

// Export
module.exports = {
    handleValidationErrors,
    validateEvent,
    validatePoolItem,
    validateTour,
    validateEmployee,
    validateVariant,
    validateVariantId,
    validateBulkData,
    validateGeocoding
};

