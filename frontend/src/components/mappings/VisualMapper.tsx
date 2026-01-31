import { useState, useEffect, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Link2,
  Type,
  Search,
  User,
  Package,
  Check,
  X,
  AlertCircle,
  Play,
  Save,
  Trash2,
} from 'lucide-react';
import {
  FieldMapping,
  QBOCustomer,
  QBOItem,
  VisualFieldMapping,
  LookupType,
} from '../../types';

// QBO Invoice required and optional fields
const QBO_REQUIRED_FIELDS = [
  {
    path: 'CustomerRef.value',
    label: 'Customer',
    required: true,
    lookupType: 'customer' as LookupType,
    description: 'The customer for this invoice',
  },
  {
    path: 'Line[0].Amount',
    label: 'Line Amount',
    required: true,
    description: 'The total amount for the first line item',
  },
  {
    path: 'Line[0].DetailType',
    label: 'Detail Type',
    required: true,
    defaultValue: 'SalesItemLineDetail',
    description: 'Always "SalesItemLineDetail" for product/service lines',
  },
  {
    path: 'Line[0].SalesItemLineDetail.ItemRef.value',
    label: 'Item/Product',
    required: true,
    lookupType: 'item' as LookupType,
    description: 'The product or service being sold',
  },
];

const QBO_OPTIONAL_FIELDS = [
  { path: 'DocNumber', label: 'Invoice Number', description: 'Custom invoice number' },
  { path: 'TxnDate', label: 'Transaction Date', description: 'Date of the invoice' },
  { path: 'DueDate', label: 'Due Date', description: 'Payment due date' },
  { path: 'BillEmail.Address', label: 'Bill Email', description: 'Customer email for invoice' },
  { path: 'CustomerMemo.value', label: 'Customer Memo', description: 'Note visible to customer' },
  { path: 'PrivateNote', label: 'Private Note', description: 'Internal note (not visible to customer)' },
  { path: 'Line[0].Description', label: 'Line Description', description: 'Description for the line item' },
  { path: 'Line[0].SalesItemLineDetail.Qty', label: 'Quantity', description: 'Number of items' },
  { path: 'Line[0].SalesItemLineDetail.UnitPrice', label: 'Unit Price', description: 'Price per unit' },
];

interface VisualMapperProps {
  sourcePayload: Record<string, unknown> | null;
  existingMappings?: FieldMapping[];
  onSave: (mappings: FieldMapping[]) => Promise<void>;
  onTest?: (mappings: FieldMapping[]) => Promise<void>;
  fetchCustomers: (search?: string) => Promise<QBOCustomer[]>;
  fetchItems: (search?: string) => Promise<QBOItem[]>;
}

export default function VisualMapper({
  sourcePayload,
  existingMappings = [],
  onSave,
  onTest,
  fetchCustomers,
  fetchItems,
}: VisualMapperProps) {
  const [mappings, setMappings] = useState<Map<string, VisualFieldMapping>>(new Map());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedQboField, setSelectedQboField] = useState<string | null>(null);
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Initialize mappings from existing
  useEffect(() => {
    const map = new Map<string, VisualFieldMapping>();
    existingMappings.forEach(m => {
      map.set(m.qboField, m);
    });

    // Set defaults
    QBO_REQUIRED_FIELDS.forEach(field => {
      if (!map.has(field.path) && field.defaultValue) {
        map.set(field.path, {
          qboField: field.path,
          staticValue: field.defaultValue,
          isRequired: field.required,
        });
      }
    });

    setMappings(map);
  }, [existingMappings]);

  // Extract JSON paths from payload
  const extractPaths = useCallback((obj: unknown, prefix = '$'): string[] => {
    const paths: string[] = [];

    if (obj && typeof obj === 'object') {
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          paths.push(`${prefix}[${index}]`);
          paths.push(...extractPaths(item, `${prefix}[${index}]`));
        });
      } else {
        Object.entries(obj as Record<string, unknown>).forEach(([key, value]) => {
          const path = `${prefix}.${key}`;
          paths.push(path);
          paths.push(...extractPaths(value, path));
        });
      }
    }

    return paths;
  }, []);

  // extractPaths is available for future use (e.g., autocomplete suggestions)
  // const jsonPaths = sourcePayload ? extractPaths(sourcePayload) : [];

  const updateMapping = (qboField: string, update: Partial<VisualFieldMapping>) => {
    setMappings(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(qboField) || { qboField };
      newMap.set(qboField, { ...existing, ...update });
      return newMap;
    });
  };

  const removeMapping = (qboField: string) => {
    setMappings(prev => {
      const newMap = new Map(prev);
      newMap.delete(qboField);
      return newMap;
    });
  };

  const handleSourceFieldClick = (path: string) => {
    if (selectedQboField) {
      updateMapping(selectedQboField, {
        sourceField: path,
        staticValue: undefined,
        lookupValue: undefined,
      });
      setSelectedQboField(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fieldMappings = Array.from(mappings.values()).filter(
        m => m.sourceField || m.staticValue
      );
      await onSave(fieldMappings);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!onTest) return;
    setTesting(true);
    try {
      const fieldMappings = Array.from(mappings.values()).filter(
        m => m.sourceField || m.staticValue
      );
      await onTest(fieldMappings);
    } finally {
      setTesting(false);
    }
  };

  const getMappingStatus = (field: typeof QBO_REQUIRED_FIELDS[0]) => {
    const mapping = mappings.get(field.path);
    if (!mapping) return field.required ? 'missing' : 'empty';
    if (mapping.sourceField || mapping.staticValue) return 'mapped';
    return field.required ? 'missing' : 'empty';
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Visual Mapper</h2>
            <p className="text-sm text-gray-500">
              Map webhook fields to QuickBooks Invoice fields
            </p>
          </div>
          <div className="flex items-center gap-3">
            {onTest && (
              <button
                onClick={handleTest}
                disabled={testing}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <Play className="w-4 h-4" />
                {testing ? 'Testing...' : 'Test'}
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Mapping'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Source Payload */}
        <div className="w-1/2 border-r border-gray-200 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-medium text-gray-700">Source Webhook</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Click a field to map it to the selected QBO field
            </p>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {sourcePayload ? (
              <JsonTreeView
                data={sourcePayload}
                onPathClick={handleSourceFieldClick}
                highlightedPaths={Array.from(mappings.values())
                  .map(m => m.sourceField)
                  .filter(Boolean) as string[]}
                selectedPath={selectedQboField ? mappings.get(selectedQboField)?.sourceField : undefined}
                expandedPaths={expandedPaths}
                onToggleExpand={path => {
                  setExpandedPaths(prev => {
                    const next = new Set(prev);
                    if (next.has(path)) next.delete(path);
                    else next.add(path);
                    return next;
                  });
                }}
              />
            ) : (
              <div className="text-center py-12 text-gray-500">
                <AlertCircle className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p>No webhook payload available</p>
                <p className="text-sm mt-1">Send a test webhook first</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: QBO Fields */}
        <div className="w-1/2 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-medium text-gray-700">QuickBooks Invoice Fields</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Configure how each field should be populated
            </p>
          </div>
          <div className="flex-1 overflow-auto">
            {/* Required Fields */}
            <div className="p-4">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                Required Fields
              </h4>
              <div className="space-y-3">
                {QBO_REQUIRED_FIELDS.map(field => (
                  <QBOFieldCard
                    key={field.path}
                    field={field}
                    mapping={mappings.get(field.path)}
                    isSelected={selectedQboField === field.path}
                    onSelect={() => setSelectedQboField(field.path)}
                    onUpdate={update => updateMapping(field.path, update)}
                    onRemove={() => removeMapping(field.path)}
                    fetchCustomers={fetchCustomers}
                    fetchItems={fetchItems}
                    status={getMappingStatus(field)}
                  />
                ))}
              </div>
            </div>

            {/* Optional Fields */}
            <div className="p-4 border-t border-gray-100">
              <button
                onClick={() => setShowOptionalFields(!showOptionalFields)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              >
                {showOptionalFields ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <span className="font-medium">Optional Fields</span>
                <span className="text-gray-400">({QBO_OPTIONAL_FIELDS.length})</span>
              </button>

              {showOptionalFields && (
                <div className="mt-3 space-y-3">
                  {QBO_OPTIONAL_FIELDS.map(field => (
                    <QBOFieldCard
                      key={field.path}
                      field={{ ...field, required: false }}
                      mapping={mappings.get(field.path)}
                      isSelected={selectedQboField === field.path}
                      onSelect={() => setSelectedQboField(field.path)}
                      onUpdate={update => updateMapping(field.path, update)}
                      onRemove={() => removeMapping(field.path)}
                      fetchCustomers={fetchCustomers}
                      fetchItems={fetchItems}
                      status={getMappingStatus({ ...field, required: false })}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// JSON Tree View Component
function JsonTreeView({
  data,
  onPathClick,
  highlightedPaths,
  selectedPath,
  expandedPaths,
  onToggleExpand,
  path = '$',
  depth = 0,
}: {
  data: unknown;
  onPathClick: (path: string) => void;
  highlightedPaths: string[];
  selectedPath?: string;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  path?: string;
  depth?: number;
}) {
  if (data === null || data === undefined) {
    return <span className="text-gray-400">null</span>;
  }

  if (typeof data !== 'object') {
    const isHighlighted = highlightedPaths.includes(path);
    const isSelected = selectedPath === path;

    return (
      <button
        onClick={() => onPathClick(path)}
        className={`text-left px-2 py-0.5 rounded text-sm transition-colors ${
          isSelected
            ? 'bg-blue-100 text-blue-700'
            : isHighlighted
            ? 'bg-green-50 text-green-700'
            : 'hover:bg-gray-100'
        }`}
      >
        {typeof data === 'string' ? (
          <span className="text-green-600">"{data}"</span>
        ) : (
          <span className="text-blue-600">{String(data)}</span>
        )}
      </button>
    );
  }

  const isArray = Array.isArray(data);
  const entries = isArray
    ? data.map((item, index) => [`[${index}]`, item] as const)
    : Object.entries(data as Record<string, unknown>);
  const isExpanded = expandedPaths.has(path);

  return (
    <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      {depth > 0 && (
        <button
          onClick={() => onToggleExpand(path)}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm"
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <span className="text-gray-400">{isArray ? '[' : '{'}</span>
          {!isExpanded && (
            <span className="text-gray-400 text-xs">
              {entries.length} {isArray ? 'items' : 'keys'}
            </span>
          )}
          {!isExpanded && <span className="text-gray-400">{isArray ? ']' : '}'}</span>}
        </button>
      )}
      {(isExpanded || depth === 0) && (
        <>
          {entries.map(([key, value]) => {
            const childPath = isArray ? `${path}${key}` : `${path}.${key}`;
            const isHighlighted = highlightedPaths.includes(childPath);
            const isSelected = selectedPath === childPath;
            const isObject = value && typeof value === 'object';

            return (
              <div key={key} className="flex items-start gap-1 my-1">
                {!isArray && (
                  <button
                    onClick={() => !isObject && onPathClick(childPath)}
                    className={`font-medium text-sm px-1 rounded transition-colors ${
                      isSelected
                        ? 'bg-blue-100 text-blue-700'
                        : isHighlighted
                        ? 'bg-green-50 text-green-700'
                        : 'text-purple-600 hover:bg-gray-100'
                    }`}
                  >
                    {key}:
                  </button>
                )}
                <JsonTreeView
                  data={value}
                  onPathClick={onPathClick}
                  highlightedPaths={highlightedPaths}
                  selectedPath={selectedPath}
                  expandedPaths={expandedPaths}
                  onToggleExpand={onToggleExpand}
                  path={childPath}
                  depth={depth + 1}
                />
              </div>
            );
          })}
          {depth > 0 && (
            <span className="text-gray-400 text-sm">{isArray ? ']' : '}'}</span>
          )}
        </>
      )}
    </div>
  );
}

// QBO Field Card Component
function QBOFieldCard({
  field,
  mapping,
  isSelected,
  onSelect,
  onUpdate,
  onRemove,
  fetchCustomers,
  fetchItems,
  status,
}: {
  field: {
    path: string;
    label: string;
    required: boolean;
    lookupType?: LookupType;
    description?: string;
    defaultValue?: string;
  };
  mapping?: VisualFieldMapping;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (update: Partial<VisualFieldMapping>) => void;
  onRemove: () => void;
  fetchCustomers: (search?: string) => Promise<QBOCustomer[]>;
  fetchItems: (search?: string) => Promise<QBOItem[]>;
  status: 'mapped' | 'missing' | 'empty';
}) {
  const [mode, setMode] = useState<'source' | 'static' | 'lookup'>(
    mapping?.lookupValue ? 'lookup' : mapping?.staticValue ? 'static' : 'source'
  );

  const statusColors = {
    mapped: 'border-green-200 bg-green-50',
    missing: 'border-red-200 bg-red-50',
    empty: 'border-gray-200 bg-white',
  };

  const statusIcons = {
    mapped: <Check className="w-4 h-4 text-green-500" />,
    missing: <AlertCircle className="w-4 h-4 text-red-500" />,
    empty: null,
  };

  return (
    <div
      className={`rounded-lg border p-3 transition-all ${statusColors[status]} ${
        isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 text-sm">{field.label}</span>
            {field.required && (
              <span className="text-xs text-red-500 font-medium">*</span>
            )}
            {statusIcons[status]}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{field.description}</p>
        </div>
        {mapping && (mapping.sourceField || mapping.staticValue) && (
          <button
            onClick={onRemove}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mode Selector */}
      <div className="flex gap-1 mt-3 mb-2">
        <ModeButton
          icon={<Link2 className="w-3.5 h-3.5" />}
          label="From Payload"
          active={mode === 'source'}
          onClick={() => {
            setMode('source');
            onSelect();
          }}
        />
        <ModeButton
          icon={<Type className="w-3.5 h-3.5" />}
          label="Static"
          active={mode === 'static'}
          onClick={() => setMode('static')}
        />
        {field.lookupType && (
          <ModeButton
            icon={field.lookupType === 'customer' ? <User className="w-3.5 h-3.5" /> : <Package className="w-3.5 h-3.5" />}
            label="Lookup"
            active={mode === 'lookup'}
            onClick={() => setMode('lookup')}
          />
        )}
      </div>

      {/* Value Input */}
      {mode === 'source' && (
        <div
          onClick={onSelect}
          className={`px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
            mapping?.sourceField
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-gray-200 bg-gray-50 text-gray-500'
          }`}
        >
          {mapping?.sourceField || 'Click a field on the left →'}
        </div>
      )}

      {mode === 'static' && (
        <input
          type="text"
          value={mapping?.staticValue || ''}
          onChange={e =>
            onUpdate({
              staticValue: e.target.value || undefined,
              sourceField: undefined,
              lookupValue: undefined,
            })
          }
          placeholder="Enter static value..."
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      )}

      {mode === 'lookup' && field.lookupType && (
        <LookupSelect
          type={field.lookupType}
          value={mapping?.lookupValue}
          onChange={value =>
            onUpdate({
              staticValue: value?.id,
              lookupValue: value,
              sourceField: undefined,
            })
          }
          fetchCustomers={fetchCustomers}
          fetchItems={fetchItems}
        />
      )}
    </div>
  );
}

function ModeButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// Lookup Select Component
function LookupSelect({
  type,
  value,
  onChange,
  fetchCustomers,
  fetchItems,
}: {
  type: LookupType;
  value?: { id: string; name: string };
  onChange: (value: { id: string; name: string } | undefined) => void;
  fetchCustomers: (search?: string) => Promise<QBOCustomer[]>;
  fetchItems: (search?: string) => Promise<QBOItem[]>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<Array<{ id: string; name: string; extra?: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    const loadOptions = async () => {
      setLoading(true);
      try {
        if (type === 'customer') {
          const customers = await fetchCustomers(search || undefined);
          setOptions(
            customers.map(c => ({
              id: c.id,
              name: c.name,
              extra: c.email,
            }))
          );
        } else {
          const items = await fetchItems(search || undefined);
          setOptions(
            items.map(i => ({
              id: i.id,
              name: i.name,
              extra: i.unitPrice ? `$${i.unitPrice}` : undefined,
            }))
          );
        }
      } catch (error) {
        console.error('Failed to load options:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(loadOptions, 300);
    return () => clearTimeout(debounce);
  }, [open, search, type, fetchCustomers, fetchItems]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        {value ? (
          <span className="text-gray-900">{value.name}</span>
        ) : (
          <span className="text-gray-500">
            Select {type === 'customer' ? 'customer' : 'item'}...
          </span>
        )}
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {open && (
        <div className="absolute z-10 w-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${type}s...`}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-auto">
            {loading ? (
              <div className="p-4 text-center text-sm text-gray-500">Loading...</div>
            ) : options.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">No results found</div>
            ) : (
              options.map(option => (
                <button
                  key={option.id}
                  onClick={() => {
                    onChange({ id: option.id, name: option.name });
                    setOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium text-gray-900">{option.name}</div>
                    {option.extra && (
                      <div className="text-xs text-gray-500">{option.extra}</div>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                    {option.id}
                  </span>
                </button>
              ))
            )}
          </div>
          {value && (
            <div className="p-2 border-t border-gray-100">
              <button
                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
                className="w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md flex items-center justify-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
