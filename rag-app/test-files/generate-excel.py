#!/usr/bin/env python3
"""Generate Excel test files with various scenarios."""

import xlsxwriter
from datetime import datetime, timedelta

def create_basic_excel():
    """Create a basic Excel file with sample data."""
    workbook = xlsxwriter.Workbook('test-basic.xlsx')
    worksheet = workbook.add_worksheet('Data')

    # Headers
    headers = ['ID', 'Name', 'Email', 'Department', 'Salary', 'Start Date', 'Active']
    worksheet.write_row(0, 0, headers)

    # Data
    data = [
        [1, 'John Smith', 'john@company.com', 'Engineering', 75000, '2022-01-15', 'TRUE'],
        [2, 'Jane Doe', 'jane@company.com', 'Marketing', 65000, '2022-03-20', 'TRUE'],
        [3, 'Bob Johnson', 'bob@company.com', 'Sales', 70000, '2021-11-10', 'FALSE'],
        [4, 'Alice Brown', 'alice@company.com', 'HR', 60000, '2023-02-01', 'TRUE'],
        [5, 'Charlie Wilson', 'charlie@company.com', 'Engineering', 85000, '2020-06-15', 'TRUE'],
    ]

    for row_num, row_data in enumerate(data, 1):
        worksheet.write_row(row_num, 0, row_data)

    workbook.close()
    print("Created test-basic.xlsx")

def create_multi_sheet_excel():
    """Create an Excel file with multiple sheets."""
    workbook = xlsxwriter.Workbook('test-multisheet.xlsx')

    # Sheet 1: Employees
    worksheet1 = workbook.add_worksheet('Employees')
    worksheet1.write_row(0, 0, ['ID', 'Name', 'Department'])
    worksheet1.write_row(1, 0, [1, 'John Smith', 'Engineering'])
    worksheet1.write_row(2, 0, [2, 'Jane Doe', 'Marketing'])

    # Sheet 2: Departments
    worksheet2 = workbook.add_worksheet('Departments')
    worksheet2.write_row(0, 0, ['Dept ID', 'Department Name', 'Budget'])
    worksheet2.write_row(1, 0, [101, 'Engineering', 500000])
    worksheet2.write_row(2, 0, [102, 'Marketing', 300000])

    # Sheet 3: Projects
    worksheet3 = workbook.add_worksheet('Projects')
    worksheet3.write_row(0, 0, ['Project ID', 'Project Name', 'Status', 'Deadline'])
    worksheet3.write_row(1, 0, ['P001', 'Website Redesign', 'In Progress', '2024-06-30'])
    worksheet3.write_row(2, 0, ['P002', 'Mobile App', 'Planning', '2024-09-15'])

    workbook.close()
    print("Created test-multisheet.xlsx")

def create_formatted_excel():
    """Create an Excel file with various formats and formulas."""
    workbook = xlsxwriter.Workbook('test-formatted.xlsx')
    worksheet = workbook.add_worksheet('Formatted Data')

    # Add formats
    bold = workbook.add_format({'bold': True})
    money = workbook.add_format({'num_format': '$#,##0.00'})
    date_format = workbook.add_format({'num_format': 'yyyy-mm-dd'})
    percent_format = workbook.add_format({'num_format': '0.00%'})

    # Headers
    headers = ['Product', 'Quantity', 'Price', 'Total', 'Tax Rate', 'Date']
    worksheet.write_row(0, 0, headers, bold)

    # Data with formats
    worksheet.write(1, 0, 'Widget A')
    worksheet.write(1, 1, 10)
    worksheet.write(1, 2, 25.50, money)
    worksheet.write_formula(1, 3, '=B2*C2', money)  # Formula
    worksheet.write(1, 4, 0.08, percent_format)
    worksheet.write(1, 5, datetime(2024, 1, 15), date_format)

    worksheet.write(2, 0, 'Widget B')
    worksheet.write(2, 1, 5)
    worksheet.write(2, 2, 50.00, money)
    worksheet.write_formula(2, 3, '=B3*C3', money)
    worksheet.write(2, 4, 0.08, percent_format)
    worksheet.write(2, 5, datetime(2024, 2, 20), date_format)

    workbook.close()
    print("Created test-formatted.xlsx")

def create_empty_excel():
    """Create an Excel file with just headers."""
    workbook = xlsxwriter.Workbook('test-excel-empty.xlsx')
    worksheet = workbook.add_worksheet()
    worksheet.write_row(0, 0, ['Column1', 'Column2', 'Column3'])
    workbook.close()
    print("Created test-excel-empty.xlsx")

if __name__ == "__main__":
    try:
        create_basic_excel()
        create_multi_sheet_excel()
        create_formatted_excel()
        create_empty_excel()
        print("\nAll Excel test files created successfully!")
    except ImportError:
        print("xlsxwriter not installed. Installing it now...")
        import subprocess
        subprocess.run(["pip3", "install", "xlsxwriter"])
        print("Please run the script again.")