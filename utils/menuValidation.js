export const validateMenuItem = (item, rowNumber) => {
  const errors = [];
  const sanitizedData = {};

  // Validate category
  if (!item.category || item.category.trim() === "") {
    errors.push(`Row ${rowNumber}: Category is required`);
  } else {
    sanitizedData.category = item.category.trim();
  }

  // Validate name
  if (!item.name || item.name.trim() === "") {
    errors.push(`Row ${rowNumber}: Name is required`);
  } else {
    sanitizedData.name = item.name.trim();
  }

  // Validate description
  sanitizedData.description = item.description ? item.description.trim() : "";

  // Validate price
  const price = parseFloat(item.price);
  if (isNaN(price) || price < 0) {
    errors.push(`Row ${rowNumber}: Price must be a valid positive number`);
  } else {
    sanitizedData.price = price;
  }

  // Validate currency
  sanitizedData.currency = item.currency
    ? item.currency.trim().toUpperCase()
    : "LKR";

  // Validate is_available
  if (item.is_available !== undefined) {
    const availStr = String(item.is_available).toLowerCase().trim();
    sanitizedData.is_available =
      availStr === "true" || availStr === "1" || availStr === "yes";
  } else {
    sanitizedData.is_available = true;
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedData,
  };
};

// Column validation
export const validateCSVColumns = (rows) => {
  if (!rows || rows.length === 0) {
    return { isValid: false, missingColumns: ["No data found in CSV"] };
  }

  const requiredColumns = ["category", "name", "price"];
  const firstRow = rows[0];
  const actualColumns = Object.keys(firstRow).filter(
    (key) => key !== "_rowNumber",
  );

  const missingColumns = requiredColumns.filter(
    (col) => !actualColumns.includes(col),
  );

  return {
    isValid: missingColumns.length === 0,
    missingColumns,
  };
};
