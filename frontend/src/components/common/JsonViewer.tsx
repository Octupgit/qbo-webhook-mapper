import React, { useState } from 'react';
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

interface JsonViewerProps {
  data: unknown;
  onPathClick?: (path: string) => void;
  highlightedPaths?: string[];
  expandLevel?: number;
}

interface JsonNodeProps {
  keyName: string | null;
  value: unknown;
  path: string;
  depth: number;
  onPathClick?: (path: string) => void;
  highlightedPaths?: string[];
  expandLevel: number;
}

function JsonNode({
  keyName,
  value,
  path,
  depth,
  onPathClick,
  highlightedPaths,
  expandLevel,
}: JsonNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < expandLevel);

  const isHighlighted = highlightedPaths?.includes(path);
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);

  const handleClick = () => {
    if (onPathClick && !isObject) {
      onPathClick(path);
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const renderValue = () => {
    if (value === null) {
      return <span className="text-gray-400">null</span>;
    }
    if (typeof value === 'boolean') {
      return <span className="text-purple-600">{value.toString()}</span>;
    }
    if (typeof value === 'number') {
      return <span className="text-blue-600">{value}</span>;
    }
    if (typeof value === 'string') {
      return <span className="text-green-600">"{value}"</span>;
    }
    return null;
  };

  if (!isObject) {
    return (
      <div
        className={`
          flex items-center py-0.5 cursor-pointer hover:bg-blue-50 rounded px-1
          ${isHighlighted ? 'bg-yellow-100' : ''}
        `}
        style={{ paddingLeft: depth * 16 }}
        onClick={handleClick}
      >
        {keyName !== null && (
          <span className="text-red-700 mr-1">"{keyName}":</span>
        )}
        {renderValue()}
      </div>
    );
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [`${i}`, v] as const)
    : Object.entries(value as Record<string, unknown>);

  const brackets = isArray ? ['[', ']'] : ['{', '}'];

  return (
    <div>
      <div
        className={`
          flex items-center py-0.5 cursor-pointer hover:bg-gray-50 rounded px-1
          ${isHighlighted ? 'bg-yellow-100' : ''}
        `}
        style={{ paddingLeft: depth * 16 }}
        onClick={handleToggle}
      >
        <button className="w-4 h-4 mr-1 flex-shrink-0">
          {isExpanded ? (
            <ChevronDownIcon className="w-3 h-3 text-gray-500" />
          ) : (
            <ChevronRightIcon className="w-3 h-3 text-gray-500" />
          )}
        </button>
        {keyName !== null && (
          <span className="text-red-700 mr-1">"{keyName}":</span>
        )}
        <span className="text-gray-500">
          {brackets[0]}
          {!isExpanded && (
            <span className="text-gray-400 text-xs ml-1">
              {entries.length} {isArray ? 'items' : 'keys'}
            </span>
          )}
          {!isExpanded && brackets[1]}
        </span>
      </div>
      {isExpanded && (
        <>
          {entries.map(([key, val]) => (
            <JsonNode
              key={key}
              keyName={isArray ? null : key}
              value={val}
              path={isArray ? `${path}[${key}]` : `${path}.${key}`}
              depth={depth + 1}
              onPathClick={onPathClick}
              highlightedPaths={highlightedPaths}
              expandLevel={expandLevel}
            />
          ))}
          <div style={{ paddingLeft: depth * 16 }} className="text-gray-500 px-1">
            {brackets[1]}
          </div>
        </>
      )}
    </div>
  );
}

export default function JsonViewer({
  data,
  onPathClick,
  highlightedPaths,
  expandLevel = 2,
}: JsonViewerProps) {
  return (
    <div className="font-mono text-sm overflow-auto max-h-96 bg-gray-50 rounded-lg p-3 border border-gray-200">
      <JsonNode
        keyName={null}
        value={data}
        path="$"
        depth={0}
        onPathClick={onPathClick}
        highlightedPaths={highlightedPaths}
        expandLevel={expandLevel}
      />
    </div>
  );
}
