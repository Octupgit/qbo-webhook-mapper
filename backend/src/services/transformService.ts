import _ from 'lodash';
import {
  FieldMapping,
  MappingConfiguration,
  QBOInvoice,
  TransformTestResult,
} from '../types';

// Extract value from JSON using dot notation path (e.g., "customer.name" or "items[0].price")
function extractValue(obj: unknown, path: string): unknown {
  // Handle JSONPath-like syntax ($.customer.name -> customer.name)
  const cleanPath = path.startsWith('$.') ? path.slice(2) : path;
  return _.get(obj, cleanPath);
}

// Apply transformation to a value
function applyTransformation(value: unknown, transformation: string | null | undefined): unknown {
  if (!transformation || transformation === 'none') {
    return value;
  }

  const [transformType, ...args] = transformation.split(':');

  switch (transformType) {
    case 'toString':
      return value == null ? '' : String(value);

    case 'toNumber':
      if (value == null) return 0;
      const num = Number(value);
      return isNaN(num) ? 0 : num;

    case 'toUpperCase':
      return value == null ? '' : String(value).toUpperCase();

    case 'toLowerCase':
      return value == null ? '' : String(value).toLowerCase();

    case 'concat': {
      const [prefix = '', suffix = ''] = args;
      return `${prefix}${value ?? ''}${suffix}`;
    }

    case 'multiply': {
      const factor = parseFloat(args[0] || '1');
      const numValue = Number(value);
      return isNaN(numValue) ? 0 : numValue * factor;
    }

    case 'substring': {
      const start = parseInt(args[0] || '0', 10);
      const end = args[1] ? parseInt(args[1], 10) : undefined;
      return String(value ?? '').substring(start, end);
    }

    case 'replace': {
      const [oldStr = '', newStr = ''] = args;
      return String(value ?? '').replace(new RegExp(oldStr, 'g'), newStr);
    }

    case 'default': {
      const defaultValue = args[0] || '';
      return value == null || value === '' ? defaultValue : value;
    }

    case 'formatDate': {
      if (!value) return '';
      const date = new Date(value as string | number);
      if (isNaN(date.getTime())) return String(value);
      return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }

    case 'trim':
      return String(value ?? '').trim();

    case 'split': {
      const delimiter = args[0] || ',';
      const index = parseInt(args[1] || '0', 10);
      const parts = String(value ?? '').split(delimiter);
      return parts[index] || '';
    }

    default:
      return value;
  }
}

// Set value in object using dot notation path (supports nested objects and arrays)
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  _.set(obj, path, value);
}

// Validate the transformed invoice
function validateInvoice(invoice: Partial<QBOInvoice>): string[] {
  const errors: string[] = [];

  if (!invoice.CustomerRef?.value) {
    errors.push('CustomerRef.value is required');
  }

  if (!invoice.Line || invoice.Line.length === 0) {
    errors.push('At least one Line item is required');
  } else {
    invoice.Line.forEach((line, index) => {
      if (line.Amount == null || isNaN(line.Amount)) {
        errors.push(`Line[${index}].Amount is required and must be a number`);
      }
      if (!line.DetailType) {
        errors.push(`Line[${index}].DetailType is required`);
      }
      if (!line.SalesItemLineDetail?.ItemRef?.value) {
        errors.push(`Line[${index}].SalesItemLineDetail.ItemRef.value is required`);
      }
    });
  }

  return errors;
}

// Transform source payload to QBO Invoice using mapping configuration
export function transformPayloadToInvoice(
  sourcePayload: unknown,
  mapping: MappingConfiguration
): TransformTestResult {
  const warnings: string[] = [];
  const invoice: Record<string, unknown> = {};

  // Apply field mappings
  for (const fieldMapping of mapping.field_mappings) {
    let value: unknown;

    if (fieldMapping.staticValue !== undefined) {
      // Use static value
      value = fieldMapping.staticValue;
    } else if (fieldMapping.sourceField) {
      // Extract from source payload
      value = extractValue(sourcePayload, fieldMapping.sourceField);

      if (value === undefined && fieldMapping.isRequired) {
        warnings.push(
          `Required field ${fieldMapping.qboField} has no value (source: ${fieldMapping.sourceField})`
        );
      }
    }

    // Apply transformation
    if (value !== undefined || fieldMapping.staticValue !== undefined) {
      value = applyTransformation(value, fieldMapping.transformation);
      setNestedValue(invoice, fieldMapping.qboField, value);
    }
  }

  // Apply static values from mapping
  if (mapping.static_values) {
    for (const [key, value] of Object.entries(mapping.static_values)) {
      setNestedValue(invoice, key, value);
    }
  }

  // Ensure Line items have DetailType set
  if (invoice.Line && Array.isArray(invoice.Line)) {
    invoice.Line = (invoice.Line as Record<string, unknown>[]).map((line) => ({
      ...line,
      DetailType: line.DetailType || 'SalesItemLineDetail',
    }));
  }

  // Validate the invoice
  const validationErrors = validateInvoice(invoice as Partial<QBOInvoice>);

  return {
    success: validationErrors.length === 0,
    transformedInvoice: invoice as QBOInvoice,
    validationErrors,
    warnings,
  };
}

// Get all available QBO Invoice fields for the UI
export function getQBOInvoiceFields(): Array<{
  path: string;
  label: string;
  type: string;
  required: boolean;
  description: string;
}> {
  return [
    // Required fields
    { path: 'CustomerRef.value', label: 'Customer ID', type: 'string', required: true, description: 'QBO Customer ID' },
    { path: 'Line[0].Amount', label: 'Line 1 Amount', type: 'number', required: true, description: 'Line item amount' },
    { path: 'Line[0].SalesItemLineDetail.ItemRef.value', label: 'Line 1 Item ID', type: 'string', required: true, description: 'QBO Product/Service ID' },

    // Common optional fields
    { path: 'DocNumber', label: 'Invoice Number', type: 'string', required: false, description: 'Invoice number (auto-generated if not provided)' },
    { path: 'TxnDate', label: 'Transaction Date', type: 'string', required: false, description: 'Date format: YYYY-MM-DD' },
    { path: 'DueDate', label: 'Due Date', type: 'string', required: false, description: 'Date format: YYYY-MM-DD' },
    { path: 'CustomerMemo.value', label: 'Customer Memo', type: 'string', required: false, description: 'Message to customer' },
    { path: 'PrivateNote', label: 'Private Note', type: 'string', required: false, description: 'Internal note (not visible to customer)' },
    { path: 'BillEmail.Address', label: 'Customer Email', type: 'string', required: false, description: 'Email address for invoice' },

    // Line item details
    { path: 'Line[0].Description', label: 'Line 1 Description', type: 'string', required: false, description: 'Line item description' },
    { path: 'Line[0].SalesItemLineDetail.UnitPrice', label: 'Line 1 Unit Price', type: 'number', required: false, description: 'Price per unit' },
    { path: 'Line[0].SalesItemLineDetail.Qty', label: 'Line 1 Quantity', type: 'number', required: false, description: 'Quantity' },

    // Additional line items
    { path: 'Line[1].Amount', label: 'Line 2 Amount', type: 'number', required: false, description: 'Second line item amount' },
    { path: 'Line[1].SalesItemLineDetail.ItemRef.value', label: 'Line 2 Item ID', type: 'string', required: false, description: 'Second line item Product/Service ID' },
    { path: 'Line[1].Description', label: 'Line 2 Description', type: 'string', required: false, description: 'Second line item description' },

    // Billing address
    { path: 'BillAddr.Line1', label: 'Billing Address Line 1', type: 'string', required: false, description: 'Street address' },
    { path: 'BillAddr.Line2', label: 'Billing Address Line 2', type: 'string', required: false, description: 'Apt, suite, etc.' },
    { path: 'BillAddr.City', label: 'Billing City', type: 'string', required: false, description: 'City' },
    { path: 'BillAddr.CountrySubDivisionCode', label: 'Billing State', type: 'string', required: false, description: 'State/Province code' },
    { path: 'BillAddr.PostalCode', label: 'Billing Postal Code', type: 'string', required: false, description: 'Zip/Postal code' },
    { path: 'BillAddr.Country', label: 'Billing Country', type: 'string', required: false, description: 'Country' },

    // Shipping address
    { path: 'ShipAddr.Line1', label: 'Shipping Address Line 1', type: 'string', required: false, description: 'Street address' },
    { path: 'ShipAddr.City', label: 'Shipping City', type: 'string', required: false, description: 'City' },
    { path: 'ShipAddr.CountrySubDivisionCode', label: 'Shipping State', type: 'string', required: false, description: 'State/Province code' },
    { path: 'ShipAddr.PostalCode', label: 'Shipping Postal Code', type: 'string', required: false, description: 'Zip/Postal code' },

    // Other
    { path: 'SalesTermRef.value', label: 'Sales Terms ID', type: 'string', required: false, description: 'Payment terms reference' },
    { path: 'CurrencyRef.value', label: 'Currency Code', type: 'string', required: false, description: 'e.g., USD, EUR' },
    { path: 'AllowOnlineCreditCardPayment', label: 'Allow CC Payment', type: 'boolean', required: false, description: 'Allow credit card payment' },
    { path: 'AllowOnlineACHPayment', label: 'Allow ACH Payment', type: 'boolean', required: false, description: 'Allow ACH payment' },
  ];
}

// Get available transformations for the UI
export function getAvailableTransformations(): Array<{
  value: string;
  label: string;
  description: string;
  hasArgs: boolean;
}> {
  return [
    { value: 'none', label: 'None', description: 'Pass through as-is', hasArgs: false },
    { value: 'toString', label: 'To String', description: 'Convert to string', hasArgs: false },
    { value: 'toNumber', label: 'To Number', description: 'Convert to number', hasArgs: false },
    { value: 'toUpperCase', label: 'Uppercase', description: 'Convert to uppercase', hasArgs: false },
    { value: 'toLowerCase', label: 'Lowercase', description: 'Convert to lowercase', hasArgs: false },
    { value: 'trim', label: 'Trim', description: 'Remove whitespace from both ends', hasArgs: false },
    { value: 'formatDate', label: 'Format Date', description: 'Convert to YYYY-MM-DD format', hasArgs: false },
    { value: 'concat', label: 'Concatenate', description: 'Add prefix/suffix (concat:prefix:suffix)', hasArgs: true },
    { value: 'multiply', label: 'Multiply', description: 'Multiply by factor (multiply:factor)', hasArgs: true },
    { value: 'substring', label: 'Substring', description: 'Extract substring (substring:start:end)', hasArgs: true },
    { value: 'replace', label: 'Replace', description: 'Replace text (replace:old:new)', hasArgs: true },
    { value: 'default', label: 'Default', description: 'Use default if empty (default:value)', hasArgs: true },
    { value: 'split', label: 'Split', description: 'Split and get part (split:delimiter:index)', hasArgs: true },
  ];
}

// Extract all field paths from a JSON object (for the UI)
export function extractJsonPaths(obj: unknown, prefix = '$'): string[] {
  const paths: string[] = [];

  function traverse(current: unknown, currentPath: string): void {
    if (current === null || current === undefined) {
      return;
    }

    if (Array.isArray(current)) {
      paths.push(currentPath);
      current.forEach((item, index) => {
        traverse(item, `${currentPath}[${index}]`);
      });
    } else if (typeof current === 'object') {
      paths.push(currentPath);
      for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
        traverse(value, `${currentPath}.${key}`);
      }
    } else {
      paths.push(currentPath);
    }
  }

  traverse(obj, prefix);
  return paths.filter((p) => p !== '$');
}
