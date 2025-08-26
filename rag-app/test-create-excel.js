import * as XLSX from 'xlsx';

// Create first sheet - Employees
const employees = [
  ['Employee ID', 'Name', 'Position', 'Department', 'Salary', 'Start Date'],
  [1001, 'Alice Johnson', 'Senior Developer', 'Engineering', 120000, '2019-01-15'],
  [1002, 'Bob Smith', 'Product Manager', 'Product', 110000, '2020-03-10'],
  [1003, 'Carol Davis', 'UX Designer', 'Design', 85000, '2021-06-22'],
  [1004, 'David Wilson', 'Data Analyst', 'Analytics', 95000, '2020-09-05'],
  [1005, 'Eva Martinez', 'Marketing Lead', 'Marketing', 98000, '2019-11-30'],
];

// Create second sheet - Projects
const projects = [
  ['Project ID', 'Name', 'Status', 'Budget', 'Start Date', 'End Date', 'Completion %'],
  ['PRJ-001', 'Website Redesign', 'In Progress', 50000, '2024-01-01', '2024-06-30', 65],
  ['PRJ-002', 'Mobile App v2.0', 'Planning', 120000, '2024-02-15', '2024-12-31', 15],
  ['PRJ-003', 'Data Migration', 'Completed', 35000, '2023-10-01', '2024-01-15', 100],
  ['PRJ-004', 'AI Integration', 'In Progress', 85000, '2024-01-20', '2024-08-30', 40],
  ['PRJ-005', 'Security Audit', 'Not Started', 25000, '2024-03-01', '2024-04-30', 0],
];

// Create third sheet - Sales
const sales = [
  ['Date', 'Product', 'Quantity', 'Unit Price', 'Total', 'Region', 'Sales Rep'],
  ['2024-01-15', 'Widget A', 50, 29.99, 1499.50, 'North', 'John Doe'],
  ['2024-01-16', 'Widget B', 30, 49.99, 1499.70, 'South', 'Jane Smith'],
  ['2024-01-17', 'Widget C', 25, 79.99, 1999.75, 'East', 'Bob Johnson'],
  ['2024-01-18', 'Widget A', 40, 29.99, 1199.60, 'West', 'Alice Brown'],
  ['2024-01-19', 'Widget B', 35, 49.99, 1749.65, 'North', 'John Doe'],
  ['2024-01-20', 'Widget C', 20, 79.99, 1599.80, 'South', 'Jane Smith'],
  ['2024-01-21', 'Widget A', 60, 29.99, 1799.40, 'East', 'Bob Johnson'],
  ['2024-01-22', 'Widget B', 45, 49.99, 2249.55, 'West', 'Alice Brown'],
];

// Create workbook
const wb = XLSX.utils.book_new();

// Add sheets
const ws1 = XLSX.utils.aoa_to_sheet(employees);
const ws2 = XLSX.utils.aoa_to_sheet(projects);
const ws3 = XLSX.utils.aoa_to_sheet(sales);

XLSX.utils.book_append_sheet(wb, ws1, 'Employees');
XLSX.utils.book_append_sheet(wb, ws2, 'Projects');
XLSX.utils.book_append_sheet(wb, ws3, 'Sales Data');

// Write file
XLSX.writeFile(wb, 'test-data.xlsx');

console.log('Excel file created: test-data.xlsx');