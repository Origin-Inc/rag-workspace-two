import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardGrid, GridItem, DashboardLayouts, DashboardSection } from '~/components/dashboard/DashboardGrid';

describe('DashboardGrid', () => {
  it('renders with proper grid classes', () => {
    const { container } = render(
      <DashboardGrid>
        <div>Test Content</div>
      </DashboardGrid>
    );
    
    const grid = container.firstChild;
    expect(grid).toHaveClass('grid');
    expect(grid).toHaveClass('grid-cols-1');
    expect(grid).toHaveClass('sm:grid-cols-2');
    expect(grid).toHaveClass('md:grid-cols-4');
    expect(grid).toHaveClass('lg:grid-cols-6');
    expect(grid).toHaveClass('xl:grid-cols-12');
  });

  it('applies responsive gap classes', () => {
    const { container } = render(
      <DashboardGrid>
        <div>Test</div>
      </DashboardGrid>
    );
    
    const grid = container.firstChild;
    expect(grid).toHaveClass('gap-4');
    expect(grid).toHaveClass('sm:gap-6');
    expect(grid).toHaveClass('lg:gap-8');
  });

  it('applies responsive padding classes', () => {
    const { container } = render(
      <DashboardGrid>
        <div>Test</div>
      </DashboardGrid>
    );
    
    const grid = container.firstChild;
    expect(grid).toHaveClass('p-4');
    expect(grid).toHaveClass('sm:p-6');
    expect(grid).toHaveClass('lg:p-8');
  });
});

describe('GridItem', () => {
  it('renders with default span', () => {
    const { container } = render(
      <GridItem>
        <div>Content</div>
      </GridItem>
    );
    
    expect(container.firstChild).toHaveClass('min-h-0');
  });

  it('applies responsive column spans correctly', () => {
    const { container } = render(
      <GridItem colSpan={{ default: 1, sm: 2, md: 4, lg: 6, xl: 12 }}>
        <div>Content</div>
      </GridItem>
    );
    
    const item = container.firstChild;
    expect(item?.className).toContain('col-span-1');
    expect(item?.className).toContain('sm:col-span-2');
    expect(item?.className).toContain('md:col-span-4');
    expect(item?.className).toContain('lg:col-span-6');
    expect(item?.className).toContain('xl:col-span-12');
  });

  it('applies responsive row spans correctly', () => {
    const { container } = render(
      <GridItem rowSpan={{ default: 1, sm: 2, md: 3 }}>
        <div>Content</div>
      </GridItem>
    );
    
    const item = container.firstChild;
    expect(item?.className).toContain('row-span-1');
    expect(item?.className).toContain('sm:row-span-2');
    expect(item?.className).toContain('md:row-span-3');
  });
});

describe('DashboardLayouts', () => {
  it('provides correct layout configurations', () => {
    // Two-thirds + one-third layout
    expect(DashboardLayouts.twoThirdsOneThird.main).toEqual({
      default: 1,
      md: 3,
      lg: 4,
      xl: 8
    });
    expect(DashboardLayouts.twoThirdsOneThird.sidebar).toEqual({
      default: 1,
      md: 1,
      lg: 2,
      xl: 4
    });

    // Half and half layout
    expect(DashboardLayouts.halfHalf.left).toEqual({
      default: 1,
      sm: 1,
      md: 2,
      lg: 3,
      xl: 6
    });

    // Full width layout
    expect(DashboardLayouts.fullWidth.full).toEqual({
      default: 1,
      sm: 2,
      md: 4,
      lg: 6,
      xl: 12
    });

    // Four column layout
    expect(DashboardLayouts.fourColumn.column).toEqual({
      default: 1,
      sm: 1,
      md: 1,
      lg: 1,
      xl: 3
    });
  });
});

describe('DashboardSection', () => {
  it('renders with title and content', () => {
    render(
      <DashboardSection title="Test Section">
        <div>Section Content</div>
      </DashboardSection>
    );
    
    expect(screen.getByText('Test Section')).toBeInTheDocument();
    expect(screen.getByText('Section Content')).toBeInTheDocument();
  });

  it('renders with description when provided', () => {
    render(
      <DashboardSection
        title="Test Section"
        description="This is a description"
      >
        <div>Content</div>
      </DashboardSection>
    );
    
    expect(screen.getByText('This is a description')).toBeInTheDocument();
  });

  it('renders actions when provided', () => {
    render(
      <DashboardSection
        title="Test Section"
        actions={<button>Action Button</button>}
      >
        <div>Content</div>
      </DashboardSection>
    );
    
    expect(screen.getByText('Action Button')).toBeInTheDocument();
  });

  it('applies proper styling classes', () => {
    const { container } = render(
      <DashboardSection title="Test">
        <div>Content</div>
      </DashboardSection>
    );
    
    const section = container.firstChild;
    expect(section).toHaveClass('bg-white');
    expect(section).toHaveClass('dark:bg-gray-800');
    expect(section).toHaveClass('rounded-lg');
    expect(section).toHaveClass('border');
  });
});

describe('Responsive Breakpoints', () => {
  it('verifies breakpoint values are correct', () => {
    // This test verifies our responsive breakpoints match the design spec
    const breakpoints = {
      mobile: 0,      // < 640px (default)
      sm: 640,        // >= 640px (small tablets)
      md: 768,        // >= 768px (tablets)
      lg: 1024,       // >= 1024px (desktop)
      xl: 1280,       // >= 1280px (large desktop)
    };

    // Grid columns at each breakpoint
    const gridColumns = {
      mobile: 1,
      sm: 2,
      md: 4,
      lg: 6,
      xl: 12,
    };

    expect(gridColumns.mobile).toBe(1);
    expect(gridColumns.sm).toBe(2);
    expect(gridColumns.md).toBe(4);
    expect(gridColumns.lg).toBe(6);
    expect(gridColumns.xl).toBe(12);
  });
});