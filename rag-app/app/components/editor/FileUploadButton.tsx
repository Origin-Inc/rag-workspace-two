/**
 * FileUploadButton Component
 *
 * Button for uploading CSV/Excel files to create SpreadsheetBlocks.
 * Uses Remix's useFetcher for non-navigating form submission.
 * Supports optimistic UI with skeleton blocks during upload.
 */

import { useRef, useState, useEffect } from 'react';
import { useFetcher } from '@remix-run/react';
import { DocumentArrowUpIcon, DocumentCheckIcon } from '@heroicons/react/24/outline';
import { parseFileInWorker, isWorkerSupported, formatFileSize, getWorkerThreshold } from '~/services/file-parser.client';

interface FileUploadButtonProps {
  pageId: string;
  onUploadStart?: (filename: string) => void;
  onUploadComplete?: (block: any) => void;
  onUploadError?: (error: string) => void;
  onUploadProgress?: (progress: number, status: 'uploading' | 'parsing' | 'processing') => void;
}

export function FileUploadButton({
  pageId,
  onUploadStart,
  onUploadComplete,
  onUploadError,
  onUploadProgress,
}: FileUploadButtonProps) {
  const fetcher = useFetcher();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout>();

  const isUploading = fetcher.state === 'submitting';
  const uploadComplete = fetcher.state === 'idle' && fetcher.data?.success;
  const hasError = fetcher.state === 'idle' && fetcher.data?.error;

  // Simulate progress updates during upload
  useEffect(() => {
    if (isUploading && selectedFile) {
      let progress = 0;
      let status: 'uploading' | 'parsing' | 'processing' = 'uploading';

      progressIntervalRef.current = setInterval(() => {
        progress += Math.random() * 15;

        if (progress > 30 && progress <= 60) {
          status = 'parsing';
        } else if (progress > 60) {
          status = 'processing';
        }

        if (progress >= 90) {
          clearInterval(progressIntervalRef.current);
          progress = 90;
        }

        onUploadProgress?.(Math.min(progress, 90), status);
      }, 300);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isUploading, selectedFile, onUploadProgress]);

  // Handle file selection
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);

    // Validate file type
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!validExtensions.includes(fileExtension)) {
      onUploadError?.(`Invalid file type. Please upload a CSV or Excel file.`);
      setSelectedFile(null);
      return;
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      onUploadError?.(`File too large. Maximum size is 50MB.`);
      setSelectedFile(null);
      return;
    }

    // Start upload with filename
    onUploadStart?.(file.name);
    onUploadProgress?.(0, 'uploading');

    // For large files (>5MB), use client-side web worker parsing
    const threshold = getWorkerThreshold();
    const useClientParsing = file.size > threshold && isWorkerSupported();

    if (useClientParsing) {
      console.log(`[FileUpload] Using web worker for large file: ${formatFileSize(file.size)}`);

      try {
        // Parse file on client side with web worker
        const parsedData = await parseFileInWorker(file, {
          onProgress: (progress) => {
            // Update progress based on parsing status
            if (progress.status === 'parsing') {
              onUploadProgress?.(Math.min(30, progress.percent * 0.3), 'parsing');
            } else if (progress.status === 'processing') {
              onUploadProgress?.(30 + progress.percent * 0.3, 'processing');
            }
          }
        });

        if (!parsedData) {
          throw new Error('Failed to parse file');
        }

        // Send parsed data to server (much smaller payload)
        const formData = new FormData();
        formData.append('intent', 'upload-parsed-data');
        formData.append('filename', file.name);
        formData.append('parsedData', JSON.stringify(parsedData));

        onUploadProgress?.(70, 'processing');

        // Submit parsed data
        fetcher.submit(formData, {
          method: 'post',
          action: `/editor/${pageId}`,
        });
      } catch (error) {
        console.error('[FileUpload] Client parsing failed:', error);
        onUploadError?.(`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setSelectedFile(null);
      }
    } else {
      // For smaller files or when workers unavailable, use server-side parsing
      console.log(`[FileUpload] Using server parsing for file: ${formatFileSize(file.size)}`);

      // Create form data
      const formData = new FormData();
      formData.append('intent', 'upload-file');
      formData.append('file', file);

      // Submit upload
      fetcher.submit(formData, {
        method: 'post',
        action: `/editor/${pageId}`,
        encType: 'multipart/form-data',
      });
    }
  };

  // Handle upload completion
  useEffect(() => {
    if (uploadComplete && fetcher.data?.block) {
      onUploadProgress?.(100, 'processing');
      onUploadComplete?.(fetcher.data.block);
      // Clean up
      setTimeout(() => {
        setSelectedFile(null);
      }, 1000);
    }
  }, [uploadComplete, fetcher.data, onUploadComplete, onUploadProgress]);

  // Handle errors
  useEffect(() => {
    if (hasError && fetcher.data?.error) {
      onUploadError?.(fetcher.data.error);
      setSelectedFile(null);
    }
  }, [hasError, fetcher.data, onUploadError]);

  // Reset file input
  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setSelectedFile(null);
  };

  // Open file picker
  const handleButtonClick = () => {
    if (!isUploading) {
      resetFileInput();
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="relative inline-block">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading}
      />

      {/* Upload button */}
      <button
        onClick={handleButtonClick}
        disabled={isUploading}
        className={`
          inline-flex items-center gap-2 px-3 py-2
          text-sm font-medium rounded-md
          transition-all duration-200
          ${isUploading
            ? 'bg-blue-50 text-blue-600 cursor-not-allowed'
            : uploadComplete
            ? 'bg-green-50 text-green-600 hover:bg-green-100'
            : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }
        `}
        title="Upload CSV or Excel file"
      >
        {isUploading ? (
          <>
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Uploading...</span>
          </>
        ) : uploadComplete ? (
          <>
            <DocumentCheckIcon className="h-4 w-4" />
            <span>Uploaded!</span>
          </>
        ) : (
          <>
            <DocumentArrowUpIcon className="h-4 w-4" />
            <span>Upload Spreadsheet</span>
          </>
        )}
      </button>

      {/* Upload progress text */}
      {isUploading && selectedFile && (
        <div className="absolute top-full mt-2 left-0 right-0">
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3">
            <div className="text-xs text-gray-600 mb-1">
              Uploading {selectedFile.name}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full animate-pulse"
                style={{ width: '60%' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Success message */}
      {uploadComplete && fetcher.data?.message && (
        <div className="absolute top-full mt-2 left-0 right-0 z-10">
          <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg p-3 shadow-lg">
            {fetcher.data.message}
          </div>
        </div>
      )}

      {/* Error message */}
      {hasError && fetcher.data?.error && (
        <div className="absolute top-full mt-2 left-0 right-0 z-10">
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 shadow-lg">
            {fetcher.data.error}
            <button
              onClick={resetFileInput}
              className="ml-2 text-red-600 hover:text-red-800 underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}