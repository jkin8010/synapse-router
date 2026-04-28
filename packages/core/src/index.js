import { createHash } from "node:crypto";
// ─── Existing Functions (preserved) ────────────────────────────────────────
const MAX_FIELDS = 10;
const MAX_DEPTH = 2;
const MAX_ENUM_VALUES = 10;
export function validateSchema(schema) {
    const errors = [];
    if (!isNonEmptyString(schema.name)) {
        errors.push("schema name is required");
    }
    validateFields(schema.fields, "fields", 1, errors);
    return {
        valid: errors.length === 0,
        errors
    };
}
export function normalizeSchema(schema) {
    return sortObjectKeys({
        ...schema,
        fields: normalizeFields(schema.fields)
    });
}
export function hashSchema(schema) {
    const normalized = normalizeSchema(schema);
    return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
// ─── Existing Internal Helpers (preserved) ─────────────────────────────────
function validateFields(fields, path, depth, errors) {
    if (depth > MAX_DEPTH) {
        errors.push(`${path} depth cannot exceed ${MAX_DEPTH}`);
        return;
    }
    if (!Array.isArray(fields)) {
        errors.push(`${path} must be an array`);
        return;
    }
    if (fields.length > MAX_FIELDS) {
        errors.push(`${path} can contain at most ${MAX_FIELDS} fields`);
    }
    const names = new Set();
    for (const field of fields) {
        const fieldPath = `${path}.${field.name || "<unnamed>"}`;
        if (!isNonEmptyString(field.name)) {
            errors.push(`${fieldPath} name is required`);
        }
        else if (names.has(field.name)) {
            errors.push(`${fieldPath} name must be unique`);
        }
        else {
            names.add(field.name);
        }
        validateFieldType(field, fieldPath, errors);
        if (field.fields !== undefined) {
            validateFields(field.fields, `${fieldPath}.fields`, depth + 1, errors);
        }
    }
}
function validateFieldType(field, fieldPath, errors) {
    switch (field.type) {
        case "string":
        case "number":
        case "boolean":
        case "image":
            if (field.enumValues !== undefined) {
                errors.push(`${fieldPath} enumValues are only allowed for enum fields`);
            }
            return;
        case "enum":
            validateEnumField(field, fieldPath, errors);
            return;
        default: {
            const unsupportedType = field.type;
            errors.push(`${fieldPath} has unsupported type "${String(unsupportedType)}"`);
            return;
        }
    }
}
function validateEnumField(field, fieldPath, errors) {
    if (!Array.isArray(field.enumValues) || field.enumValues.length === 0) {
        errors.push(`enum field "${field.name}" must define enumValues`);
        return;
    }
    if (field.enumValues.length > MAX_ENUM_VALUES) {
        errors.push(`enum field "${field.name}" cannot have more than ${MAX_ENUM_VALUES} values`);
    }
    for (const value of field.enumValues) {
        if (!isNonEmptyString(value)) {
            errors.push(`${fieldPath} enumValues must be non-empty strings`);
        }
    }
}
function normalizeFields(fields) {
    return [...fields]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((field) => {
        const normalized = { ...field };
        if (normalized.enumValues !== undefined) {
            normalized.enumValues = [...normalized.enumValues].sort();
        }
        if (normalized.fields !== undefined) {
            normalized.fields = normalizeFields(normalized.fields);
        }
        return sortObjectKeys(normalized);
    });
}
function sortObjectKeys(value) {
    if (Array.isArray(value)) {
        return value.map(sortObjectKeys);
    }
    if (value === null || typeof value !== "object") {
        return value;
    }
    return Object.keys(value)
        .sort()
        .reduce((result, key) => {
        result[key] = sortObjectKeys(value[key]);
        return result;
    }, {});
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
//# sourceMappingURL=index.js.map