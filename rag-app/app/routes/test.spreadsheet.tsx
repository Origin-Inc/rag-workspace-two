/**
 * MINIMAL TEST ROUTE - Glide Data Grid Cell Editing
 *
 * Isolated test to debug why cells aren't editable.
 * Access at: /test/spreadsheet
 */

import { useState, useCallback } from 'react';
import DataEditor, {
  GridCell,
  GridCellKind,
  GridColumn,
  Item,
  EditableGridCell,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';

export default function TestSpreadsheet() {
  const [data, setData] = useState<string[][]>([
    ['Alice', '25', 'Engineer'],
    ['Bob', '30', 'Designer'],
    ['Charlie', '35', 'Manager'],
  ]);

  const columns: GridColumn[] = [
    { id: 'name', title: 'Name', width: 150 },
    { id: 'age', title: 'Age', width: 100 },
    { id: 'role', title: 'Role', width: 150 },
  ];

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const value = data[row]?.[col] ?? '';

      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: true,
        readonly: false,
      };
    },
    [data]
  );

  const onCellEdited = useCallback(
    ([col, row]: Item, newValue: EditableGridCell) => {
      console.log('🎉 CELL EDITED!', { col, row, newValue });

      if (newValue.kind !== GridCellKind.Text) return;

      setData((prevData) => {
        const newData = [...prevData];
        if (!newData[row]) newData[row] = [];
        newData[row][col] = newValue.data;
        return newData;
      });
    },
    []
  );

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Minimal Glide Data Grid Test</h1>
      <p className="mb-4 text-sm text-gray-600">
        Click any cell and try to edit it. Check console for "🎉 CELL EDITED!" logs.
      </p>

      <div className="border-2 border-blue-500 p-4">
        <DataEditor
          columns={columns}
          rows={data.length}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          width="100%"
          height={400}
        />
      </div>

      <div className="mt-4 p-4 bg-gray-100 rounded">
        <h3 className="font-bold mb-2">Current Data:</h3>
        <pre className="text-xs">{JSON.stringify(data, null, 2)}</pre>
      </div>
    </div>
  );
}
