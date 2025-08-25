#!/usr/bin/env python3
"""
Add subtasks to Task 20.13 for Database Block Advanced Views
"""

import json
import os

# Load existing tasks
tasks_file = '.taskmaster/tasks/tasks.json'
with open(tasks_file, 'r') as f:
    data = json.load(f)

# Find task 20.13
task_20_13 = None
task_20_index = None

for i, task in enumerate(data['tasks']):
    if task['id'] == 20:
        for j, subtask in enumerate(task.get('subtasks', [])):
            if subtask['id'] == 13:
                task_20_13 = subtask
                task_20_index = i
                break
        break

if not task_20_13:
    print("Error: Task 20.13 not found")
    exit(1)

# Define new subtasks for 20.13
new_subtasks = [
    {
        "id": 1,
        "title": "View Switching Infrastructure",
        "description": "Create ViewSwitcher component in DatabaseToolbar and add view state management",
        "status": "pending",
        "priority": "high",
        "dependencies": [],
        "details": "Create ViewSwitcher component in DatabaseToolbar, add view state management to useDatabaseBlock hook, implement view persistence in database. This provides the foundation for switching between different view types.",
        "testStrategy": "Test view switching functionality, verify state persistence, test view transitions"
    },
    {
        "id": 2,
        "title": "View-Specific Filtering UI",
        "description": "Create ViewFilters component with grouping UI and date range picker",
        "status": "pending",
        "priority": "high",
        "dependencies": [1],
        "details": "Create ViewFilters component for view-specific filter options, add grouping UI for kanban/calendar views, implement date range picker for calendar/timeline views.",
        "testStrategy": "Test filter UI responsiveness, verify grouping functionality, test date range selection"
    },
    {
        "id": 3,
        "title": "Drag & Drop Infrastructure",
        "description": "Install and setup @dnd-kit with reusable drag utilities",
        "status": "pending",
        "priority": "high",
        "dependencies": [],
        "details": "Install @dnd-kit/core and @dnd-kit/sortable, create reusable DragContext and drag utilities, implement drag overlay and collision detection for smooth drag operations.",
        "testStrategy": "Test drag and drop functionality, verify collision detection, test performance with many draggable items"
    },
    {
        "id": 4,
        "title": "Gallery View Implementation",
        "description": "Create DatabaseGallery component with virtual grid and card display",
        "status": "pending",
        "priority": "medium",
        "dependencies": [1],
        "details": "Create DatabaseGallery component with virtual grid using react-window, implement card-based display with cover images, add gallery-specific toolbar and settings.",
        "testStrategy": "Test virtual scrolling with 50k+ cards, verify image loading performance, test responsive grid layout"
    },
    {
        "id": 5,
        "title": "Kanban View Implementation",
        "description": "Create DatabaseKanban with drag-drop between columns",
        "status": "pending",
        "priority": "medium",
        "dependencies": [1, 3],
        "details": "Create DatabaseKanban component with virtual columns, implement drag-and-drop between columns using @dnd-kit, add column management (add/edit/delete columns).",
        "testStrategy": "Test drag-drop between columns, verify performance with many cards, test column management operations"
    },
    {
        "id": 6,
        "title": "Calendar View Implementation",
        "description": "Create DatabaseCalendar with month/week/day views",
        "status": "pending",
        "priority": "medium",
        "dependencies": [1, 2],
        "details": "Create DatabaseCalendar component with month/week/day views, implement date navigation and event display, add calendar-specific date filtering and event management.",
        "testStrategy": "Test view switching (month/week/day), verify event rendering, test date navigation performance"
    },
    {
        "id": 7,
        "title": "Timeline View Implementation",
        "description": "Create DatabaseTimeline with horizontal scrolling",
        "status": "pending",
        "priority": "medium",
        "dependencies": [1, 2],
        "details": "Create DatabaseTimeline component with horizontal scrolling, implement timeline navigation and zoom controls, add timeline-specific date range filtering.",
        "testStrategy": "Test horizontal scrolling performance, verify zoom functionality, test with large date ranges"
    },
    {
        "id": 8,
        "title": "View Performance Optimization",
        "description": "Implement view-specific optimizations and transitions",
        "status": "pending",
        "priority": "high",
        "dependencies": [4, 5, 6, 7],
        "details": "Implement view-specific virtual scrolling optimizations, add view transition animations and loading states, optimize data fetching for each view type to handle 50k+ records.",
        "testStrategy": "Benchmark performance with 50k+ records, measure view transition times, profile memory usage"
    },
    {
        "id": 9,
        "title": "View Testing & Integration",
        "description": "Create comprehensive test suite for all views",
        "status": "pending",
        "priority": "high",
        "dependencies": [8],
        "details": "Create comprehensive test suite for all views, test 50k+ record performance across all views, integration testing with existing database features (formulas, filtering, sorting).",
        "testStrategy": "Run performance benchmarks, verify data consistency across views, test mobile responsiveness"
    }
]

# Add subtasks to task 20.13
task_20_13['subtasks'] = new_subtasks

# Update the main task
data['tasks'][task_20_index]['subtasks'][12] = task_20_13  # Index 12 for subtask 13

# Save updated tasks
with open(tasks_file, 'w') as f:
    json.dump(data, f, indent=2)

print("✅ Successfully added 9 subtasks to Task 20.13")
print("\nSubtasks added:")
for subtask in new_subtasks:
    deps = f" (depends on: {', '.join(map(str, subtask['dependencies']))})" if subtask['dependencies'] else ""
    print(f"  20.13.{subtask['id']} - {subtask['title']}{deps}")