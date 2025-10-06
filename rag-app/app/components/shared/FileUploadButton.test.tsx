/**
 * Tests for FileUploadButton component
 *
 * Related: ADR-004 (Component Composition Patterns), Task #66
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileUploadButton } from './FileUploadButton';
import { FileUploadService } from '~/services/shared/file-upload.server';

describe('FileUploadButton', () => {
  describe('Rendering', () => {
    it('should render with default text', () => {
      const onUpload = vi.fn();
      render(<FileUploadButton onUpload={onUpload} />);

      expect(screen.getByRole('button', { name: /upload file/i })).toBeInTheDocument();
      expect(screen.getByText('Upload File')).toBeInTheDocument();
    });

    it('should render with custom children', () => {
      const onUpload = vi.fn();
      render(<FileUploadButton onUpload={onUpload}>Custom Upload</FileUploadButton>);

      expect(screen.getByText('Custom Upload')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const onUpload = vi.fn();
      render(<FileUploadButton onUpload={onUpload} className="custom-class" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });

    it('should be disabled when disabled prop is true', () => {
      const onUpload = vi.fn();
      render(<FileUploadButton onUpload={onUpload} disabled />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should have hidden file input', () => {
      const onUpload = vi.fn();
      const { container } = render(<FileUploadButton onUpload={onUpload} />);

      const input = container.querySelector('input[type="file"]');
      expect(input).toBeInTheDocument();
      expect(input).toHaveClass('hidden');
      expect(input).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('File Selection', () => {
    it('should open file dialog when button is clicked', () => {
      const onUpload = vi.fn();
      const { container } = render(<FileUploadButton onUpload={onUpload} />);

      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(input, 'click');

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should use default accept attribute', () => {
      const onUpload = vi.fn();
      const { container } = render(<FileUploadButton onUpload={onUpload} />);

      const input = container.querySelector('input[type="file"]');
      expect(input).toHaveAttribute('accept', '.csv,.xlsx,.xls');
    });

    it('should use custom accept attribute', () => {
      const onUpload = vi.fn();
      const { container } = render(
        <FileUploadButton onUpload={onUpload} accept=".csv" />
      );

      const input = container.querySelector('input[type="file"]');
      expect(input).toHaveAttribute('accept', '.csv');
    });

    it('should support multiple files when multiple prop is true', () => {
      const onUpload = vi.fn();
      const { container } = render(<FileUploadButton onUpload={onUpload} multiple />);

      const input = container.querySelector('input[type="file"]');
      expect(input).toHaveAttribute('multiple');
    });

    it('should not have multiple attribute by default', () => {
      const onUpload = vi.fn();
      const { container } = render(<FileUploadButton onUpload={onUpload} />);

      const input = container.querySelector('input[type="file"]');
      expect(input).not.toHaveAttribute('multiple');
    });
  });

  describe('File Upload', () => {
    it('should validate and upload valid CSV file', async () => {
      const onUpload = vi.fn();
      const { container } = render(<FileUploadButton onUpload={onUpload} />);

      const file = new File(['test,data'], 'test.csv', { type: 'text/csv' });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;

      // Create a mock FileList
      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledWith(file);
      });
    });

    it('should validate and upload valid Excel file', async () => {
      const onUpload = vi.fn();
      const { container } = render(<FileUploadButton onUpload={onUpload} />);

      const file = new File(['test'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledWith(file);
      });
    });

    it('should call onError for invalid file', async () => {
      const onUpload = vi.fn();
      const onError = vi.fn();
      const { container } = render(
        <FileUploadButton onUpload={onUpload} onError={onError} />
      );

      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
        expect(onUpload).not.toHaveBeenCalled();
      });
    });

    it('should call onError for file too large', async () => {
      const onUpload = vi.fn();
      const onError = vi.fn();
      const { container } = render(
        <FileUploadButton onUpload={onUpload} onError={onError} />
      );

      const largeData = new Uint8Array(51 * 1024 * 1024); // 51MB
      const file = new File([largeData], 'large.csv', { type: 'text/csv' });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.stringContaining('too large'));
        expect(onUpload).not.toHaveBeenCalled();
      });
    });

    it('should call onBeforeUpload hook before upload', async () => {
      const onUpload = vi.fn();
      const onBeforeUpload = vi.fn().mockResolvedValue(true);
      const { container } = render(
        <FileUploadButton onUpload={onUpload} onBeforeUpload={onBeforeUpload} />
      );

      const file = new File(['test,data'], 'test.csv', { type: 'text/csv' });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(onBeforeUpload).toHaveBeenCalledWith(file);
        expect(onUpload).toHaveBeenCalledWith(file);
      });
    });

    it('should cancel upload if onBeforeUpload returns false', async () => {
      const onUpload = vi.fn();
      const onBeforeUpload = vi.fn().mockResolvedValue(false);
      const { container } = render(
        <FileUploadButton onUpload={onUpload} onBeforeUpload={onBeforeUpload} />
      );

      const file = new File(['test,data'], 'test.csv', { type: 'text/csv' });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(onBeforeUpload).toHaveBeenCalledWith(file);
        expect(onUpload).not.toHaveBeenCalled();
      });
    });

    it('should handle upload errors gracefully', async () => {
      const onUpload = vi.fn().mockRejectedValue(new Error('Upload failed'));
      const onError = vi.fn();
      const { container } = render(
        <FileUploadButton onUpload={onUpload} onError={onError} />
      );

      const file = new File(['test,data'], 'test.csv', { type: 'text/csv' });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Upload failed');
      });
    });

    it('should reset input value after file selection', async () => {
      const onUpload = vi.fn();
      const { container } = render(<FileUploadButton onUpload={onUpload} />);

      const file = new File(['test,data'], 'test.csv', { type: 'text/csv' });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(input.value).toBe('');
      });
    });
  });

  describe('Multiple Files', () => {
    it('should upload multiple files when multiple prop is true', async () => {
      const onUpload = vi.fn();
      const { container } = render(<FileUploadButton onUpload={onUpload} multiple />);

      const file1 = new File(['test1'], 'test1.csv', { type: 'text/csv' });
      const file2 = new File(['test2'], 'test2.csv', { type: 'text/csv' });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(input, 'files', {
        value: [file1, file2],
        writable: false
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledTimes(2);
        expect(onUpload).toHaveBeenCalledWith(file1);
        expect(onUpload).toHaveBeenCalledWith(file2);
      });
    });

    it('should skip invalid files in multiple upload', async () => {
      const onUpload = vi.fn();
      const onError = vi.fn();
      const { container } = render(
        <FileUploadButton onUpload={onUpload} onError={onError} multiple />
      );

      const validFile = new File(['test'], 'valid.csv', { type: 'text/csv' });
      const invalidFile = new File(['test'], 'invalid.txt', { type: 'text/plain' });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(input, 'files', {
        value: [validFile, invalidFile],
        writable: false
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledTimes(1);
        expect(onUpload).toHaveBeenCalledWith(validFile);
        expect(onError).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA label', () => {
      const onUpload = vi.fn();
      render(<FileUploadButton onUpload={onUpload} />);

      const button = screen.getByRole('button', { name: /upload file/i });
      expect(button).toBeInTheDocument();
    });

    it('should disable input when button is disabled', () => {
      const onUpload = vi.fn();
      const { container } = render(<FileUploadButton onUpload={onUpload} disabled />);

      const input = container.querySelector('input[type="file"]');
      expect(input).toBeDisabled();
    });
  });
});
