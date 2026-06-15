const COLUMN_MAPPINGS = {
  category: [
    "category",
    "cat",
    "type",
    "item_type",
    "menu_category",
    "section",
  ],
  name: [
    "name",
    "item_name",
    "item",
    "dish",
    "dish_name",
    "product",
    "product_name",
    "title",
  ],
  description: [
    "description",
    "desc",
    "details",
    "info",
    "item_description",
    "about",
  ],
  price: ["price", "cost", "amount", "rate", "unit_price", "value"],
  currency: ["currency", "curr", "currency_code"],
  is_available: [
    "is_available",
    "available",
    "in_stock",
    "status",
    "active",
    "enabled",
  ],
};

// Normalize a header name for comparison
const normalizeHeader = (header) => {
  return header
    .toLowerCase()
    .trim()
    .replace(/[_\s-]+/g, "_") // Replace spaces, hyphens with underscore
    .replace(/[^a-z0-9_]/g, ""); // Remove special characters
};

// Find model field name for a CSV header
const findModelField = (csvHeader) => {
  const normalized = normalizeHeader(csvHeader);

  for (const [modelField, possibleNames] of Object.entries(COLUMN_MAPPINGS)) {
    const normalizedPossibleNames = possibleNames.map((name) =>
      normalizeHeader(name),
    );
    if (normalizedPossibleNames.includes(normalized)) {
      return modelField;
    }
  }

  return null;
};

// Create a mapping between CSV columns and model fields
export const createColumnMapping = (csvHeaders, customMapping = {}) => {
  const mapping = {};
  const unmappedColumns = [];

  // Apply custom mapping first (takes priority)
  for (const [csvCol, modelField] of Object.entries(customMapping)) {
    const normalizedCsvCol = normalizeHeader(csvCol);
    mapping[normalizedCsvCol] = modelField;
  }

  // Auto-map remaining columns
  for (const header of csvHeaders) {
    const normalized = normalizeHeader(header);

    // Skip if already mapped via custom mapping
    if (mapping[normalized]) continue;

    const modelField = findModelField(header);
    if (modelField) {
      mapping[normalized] = modelField;
    } else {
      unmappedColumns.push(header);
    }
  }

  // Check for missing required fields
  const requiredFields = ["category", "name", "price"];
  const mappedFields = Object.values(mapping);
  const missingRequired = requiredFields.filter(
    (field) => !mappedFields.includes(field),
  );

  return {
    mapping,
    unmappedColumns,
    missingRequired,
  };
};

// Transform a CSV row using the mapping
export const transformRow = (csvRow, mapping) => {
  const transformed = {};

  for (const [csvCol, value] of Object.entries(csvRow)) {
    const normalizedCol = normalizeHeader(csvCol);
    const modelField = mapping[normalizedCol];

    if (modelField) {
      transformed[modelField] = value;
    }
  }

  // Preserve row number if exists
  if (csvRow._rowNumber) {
    transformed._rowNumber = csvRow._rowNumber;
  }

  return transformed;
};

// Get suggested mappings for unmapped columns
export const getSuggestedMappings = (unmappedColumns) => {
  const allModelFields = Object.keys(COLUMN_MAPPINGS);
  const suggestions = [];

  for (const col of unmappedColumns) {
    const normalized = normalizeHeader(col);
    const fieldSuggestions = [];

    // Simple similarity check (contains substring)
    for (const field of allModelFields) {
      if (normalized.includes(field) || field.includes(normalized)) {
        fieldSuggestions.push(field);
      }
    }

    if (fieldSuggestions.length > 0) {
      suggestions.push({
        csvColumn: col,
        suggestedFields: fieldSuggestions,
      });
    }
  }

  return suggestions;
};
