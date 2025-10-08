/**
 * Shared File Upload Button Component
 *
 * Reusable file upload button that replaces inline implementations in:
 * - ChatInput.tsx
 * - ChatSidebarPerformant.tsx
 * - FileUploadZone.tsx (as part of drag-drop wrapper)
 *
 * Related ADR: ADR-004 (Component Composition Patterns)
 * Related Task: #66
 */

import { useRef, type ReactNode } from 'react';
import { FileUploadService } from '~/services/shared/file-upload.server';

export interface FileUploadButtonProps {
  /** Callback when file(s) are selected and validated */
  onUpload: (file: File) => Promise<void> | void;

  /** File type restrictions (default: '.csv,.xlsx,.xls') */
  accept?: string;

  /** Allow multiple file selection (default: false) */
  multiple?: boolean;

  /** Disable the upload button */
  disabled?: boolean;

  /** Optional CSS class for styling */
  className?: string;

  /** Custom button content (default: "Upload File") */
  children?: ReactNode;

  /** Callback for validation errors */
  onError?: (error: string) => void;

  /** Callback before upload starts (return false to cancel) */
  onBeforeUpload?: (file: File) => boolean | Promise<boolean>;
}

/**
 * FileUploadButton - Shared file upload component
 *
 * Features:
 * - Uses FileUploadService for validation
 * - Supports single or multiple files
 * - Customizable via props
 * - Accessible with proper ARIA labels
 * - Auto-resets input after selection
 */
export function FileUploadButton({
  onUpload,
  accept = FileUploadService.getAllowedTypes(),
  multiple = false,
  disabled = false,
  className,
  children = 'Upload File',
  onError,
  onBeforeUpload
}: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);

    for (const file of fileArray) {
      // Validate file using shared service
      const validation = FileUploadService.validateFile(file);

      if (!validation.valid) {
        onError?.(validation.error!);
        continue;
      }

      // Optional pre-upload hook
      if (onBeforeUpload) {
        const shouldProceed = await onBeforeUpload(file);
        if (!shouldProceed) {
          continue;
        }
      }

      // Call upload handler
      try {
        await onUpload(file);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        onError?.(errorMessage);
      }
    }

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={className}
        aria-label="Upload file"
      >
        {children}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
        aria-hidden="true"
      />
    </>
  );
}
