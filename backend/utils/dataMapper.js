/**
 * Data Mapper Utility
 * Konvertiert Datenbank-Zeilen zu API-Objekten und umgekehrt
 */

// Event-Mapper
const eventMapper = {
    // DB-Zeile zu API-Objekt
    fromDb: (row) => ({
        id: row.id,
        title: row.title,
        start: row.start_time,
        end: row.end_time,
        dayIndex: row.day_index,
        extendedProps: row.extended_props || {}
    }),
    
    // API-Objekt zu DB-Werten
    toDb: (event, variantId) => ({
        id: event.id,
        variant_id: variantId,
        title: event.title,
        start_time: event.start,
        end_time: event.end,
        day_index: event.dayIndex,
        extended_props: JSON.stringify(event.extendedProps || {})
    })
};

// Pool-Item-Mapper
const poolMapper = {
    fromDb: (row) => ({
        id: row.id,
        title: row.title,
        zone: row.zone || null,
        address: row.address || null,
        postalCode: row.postal_code || null,
        types: row.types || [],
        extendedProps: row.extended_props || {}
    }),
    
    toDb: (item, variantId) => ({
        id: item.id,
        variant_id: variantId,
        title: item.title,
        zone: item.zone || null,
        address: item.address || null,
        postal_code: item.postalCode || null,
        types: JSON.stringify(item.types || []),
        extended_props: JSON.stringify(item.extendedProps || {})
    })
};

// Tour-Mapper
const tourMapper = {
    fromDb: (row) => ({
        id: row.id,
        name: row.name,
        employeeId: row.employee_id || null,
        color: row.color || null
    }),
    
    toDb: (tour, variantId) => ({
        id: tour.id,
        variant_id: variantId,
        name: tour.name,
        employee_id: tour.employeeId || null,
        color: tour.color || null
    })
};

// Mitarbeiter-Mapper
const employeeMapper = {
    fromDb: (row) => ({
        id: row.id,
        name: row.name,
        wageGroupId: row.wage_group_id || null,
        homeZone: row.home_zone || null,
        phone: row.phone || null,
        email: row.email || null
    }),
    
    toDb: (employee, variantId) => ({
        id: employee.id,
        variant_id: variantId,
        name: employee.name,
        wage_group_id: employee.wageGroupId || null,
        home_zone: employee.homeZone || null,
        phone: employee.phone || null,
        email: employee.email || null
    })
};

// Varianten-Mapper
const variantMapper = {
    fromDb: (row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }),
    
    toDb: (variant) => ({
        name: variant.name
    })
};

// Batch-Insert Helper
const buildBatchInsert = (tableName, columns, values) => {
    if (values.length === 0) return { query: '', params: [] };
    
    const placeholders = values.map((_, rowIndex) => {
        const rowPlaceholders = columns.map((_, colIndex) => {
            return `$${rowIndex * columns.length + colIndex + 1}`;
        });
        return `(${rowPlaceholders.join(', ')})`;
    });
    
    const flatParams = values.flatMap(row => columns.map(col => row[col]));
    
    const query = `
        INSERT INTO ${tableName} (${columns.join(', ')})
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
        ${columns.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ')}
    `;
    
    return { query, params: flatParams };
};

// Batch-Delete Helper
const buildBatchDelete = (tableName, column, values) => {
    if (values.length === 0) return { query: '', params: [] };
    
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    
    return {
        query: `DELETE FROM ${tableName} WHERE ${column} IN (${placeholders})`,
        params: values
    };
};

// Collection-Mapper (für Arrays von Objekten)
const mapCollection = (rows, mapper) => {
    if (!Array.isArray(rows)) return [];
    return rows.map(row => mapper.fromDb(row));
};

module.exports = {
    eventMapper,
    poolMapper,
    tourMapper,
    employeeMapper,
    variantMapper,
    buildBatchInsert,
    buildBatchDelete,
    mapCollection
};


