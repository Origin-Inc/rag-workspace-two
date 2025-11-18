#!/usr/bin/env node
/**
 * Generate Excel test files for comprehensive testing
 */

const XLSX = require('xlsx');
const path = require('path');

// Create basic Excel file
function createBasicExcel() {
  const workbook = XLSX.utils.book_new();

  const data = [
    ['ID', 'Name', 'Email', 'Department', 'Salary', 'Start Date', 'Active'],
    [1, 'John Smith', 'john@company.com', 'Engineering', 75000, '2022-01-15', true],
    [2, 'Jane Doe', 'jane@company.com', 'Marketing', 65000, '2022-03-20', true],
    [3, 'Bob Johnson', 'bob@company.com', 'Sales', 70000, '2021-11-10', false],
    [4, 'Alice Brown', 'alice@company.com', 'HR', 60000, '2023-02-01', true],
    [5, 'Charlie Wilson', 'charlie@company.com', 'Engineering', 85000, '2020-06-15', true],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  XLSX.writeFile(workbook, path.join(__dirname, 'test-basic.xlsx'));
  console.log('Created test-basic.xlsx');
}

// Create multi-sheet Excel file
function createMultiSheetExcel() {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Employees
  const employees = [
    ['ID', 'Name', 'Department'],
    [1, 'John Smith', 'Engineering'],
    [2, 'Jane Doe', 'Marketing'],
    [3, 'Bob Johnson', 'Sales'],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(employees);
  XLSX.utils.book_append_sheet(workbook, ws1, 'Employees');

  // Sheet 2: Departments
  const departments = [
    ['Dept ID', 'Department Name', 'Budget'],
    [101, 'Engineering', 500000],
    [102, 'Marketing', 300000],
    [103, 'Sales', 400000],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(departments);
  XLSX.utils.book_append_sheet(workbook, ws2, 'Departments');

  // Sheet 3: Projects
  const projects = [
    ['Project ID', 'Project Name', 'Status', 'Deadline'],
    ['P001', 'Website Redesign', 'In Progress', '2024-06-30'],
    ['P002', 'Mobile App', 'Planning', '2024-09-15'],
    ['P003', 'API v2', 'Completed', '2024-03-01'],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(projects);
  XLSX.utils.book_append_sheet(workbook, ws3, 'Projects');

  XLSX.writeFile(workbook, path.join(__dirname, 'test-multisheet.xlsx'));
  console.log('Created test-multisheet.xlsx');
}

// Create Excel with formulas
function createFormulaExcel() {
  const workbook = XLSX.utils.book_new();

  const data = [
    ['Product', 'Quantity', 'Price', 'Total'],
    ['Widget A', 10, 25.50, { t: 'n', f: 'B2*C2' }],
    ['Widget B', 5, 50.00, { t: 'n', f: 'B3*C3' }],
    ['Widget C', 8, 35.75, { t: 'n', f: 'B4*C4' }],
    ['', '', 'Sum:', { t: 'n', f: 'SUM(D2:D4)' }],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales');

  XLSX.writeFile(workbook, path.join(__dirname, 'test-formulas.xlsx'));
  console.log('Created test-formulas.xlsx');
}

// Create empty Excel file
function createEmptyExcel() {
  const workbook = XLSX.utils.book_new();

  const data = [
    ['Column1', 'Column2', 'Column3'],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  XLSX.writeFile(workbook, path.join(__dirname, 'test-excel-empty.xlsx'));
  console.log('Created test-excel-empty.xlsx');
}

// Create Excel with mixed data types
function createMixedTypesExcel() {
  const workbook = XLSX.utils.book_new();

  const data = [
    ['Text', 'Number', 'Boolean', 'Date', 'Formula', 'Empty'],
    ['Hello', 42, true, new Date('2024-01-15'), { t: 'n', f: '2+2' }, null],
    ['World', 3.14159, false, new Date('2024-12-31'), { t: 'n', f: 'SUM(B2:B3)' }, ''],
    ['Test', -100, 'TRUE', '2024-06-15', 123.45, undefined],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Mixed');

  XLSX.writeFile(workbook, path.join(__dirname, 'test-mixed-types.xlsx'));
  console.log('Created test-mixed-types.xlsx');
}

// Run all generators
console.log('Generating Excel test files...\n');
createBasicExcel();
createMultiSheetExcel();
createFormulaExcel();
createEmptyExcel();
createMixedTypesExcel();
console.log('\nAll Excel test files created successfully!');