#!/usr/bin/env python3
"""Generate large CSV files for testing web worker parsing."""

import csv
import random
import string
from datetime import datetime, timedelta

def generate_large_csv(filename, rows=10000):
    """Generate a large CSV file with realistic data."""

    # Sample data for generation
    first_names = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry']
    last_names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Martinez']
    departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance', 'Operations', 'IT', 'Legal']
    cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego']

    with open(filename, 'w', newline='') as csvfile:
        fieldnames = ['ID', 'First Name', 'Last Name', 'Email', 'Department', 'Salary',
                     'Hire Date', 'Is Active', 'Performance Score', 'City', 'Phone', 'Notes']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

        writer.writeheader()

        start_date = datetime(2020, 1, 1)

        for i in range(1, rows + 1):
            first = random.choice(first_names)
            last = random.choice(last_names)

            row = {
                'ID': i,
                'First Name': first,
                'Last Name': last,
                'Email': f"{first.lower()}.{last.lower()}@company.com",
                'Department': random.choice(departments),
                'Salary': round(random.uniform(40000, 150000), 2),
                'Hire Date': (start_date + timedelta(days=random.randint(0, 1460))).strftime('%Y-%m-%d'),
                'Is Active': random.choice(['true', 'false']),
                'Performance Score': round(random.uniform(60, 100), 1),
                'City': random.choice(cities),
                'Phone': f"{random.randint(200, 999)}-{random.randint(200, 999)}-{random.randint(1000, 9999)}",
                'Notes': ' '.join([''.join(random.choices(string.ascii_lowercase, k=random.randint(3, 10)))
                                  for _ in range(random.randint(3, 8))])
            }

            writer.writerow(row)

            if i % 1000 == 0:
                print(f"Generated {i} rows...")

    print(f"Created {filename} with {rows} rows")

if __name__ == "__main__":
    # Generate different sized files
    generate_large_csv("test-1mb.csv", rows=5000)      # ~1MB
    generate_large_csv("test-5mb.csv", rows=25000)     # ~5MB (will trigger web worker)
    generate_large_csv("test-10mb.csv", rows=50000)    # ~10MB
    # Note: 50MB file would be too large and take too long to generate for testing
    # Our file size limit is 50MB anyway