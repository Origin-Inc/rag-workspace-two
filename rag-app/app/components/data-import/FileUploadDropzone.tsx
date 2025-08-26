import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, FileText, AlertCircle, X } from 'lucide-react';
import { cn } from '~/utils/cn';

interface FileUploadDropzoneProps {
  onFileSelect: (file: File) => void;
  isProcessing?: boolean;
  maxFileSize?: number; // in MB
  className?: string;
}

export function FileUploadDropzone({
  onFileSelect,
  isProcessing = false,
  maxFileSize = 10, // 10MB default
  className
}: FileUploadDropzoneProps) {
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    setError(null);

    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      if (rejection.errors[0]?.code === 'file-too-large') {
        setError(`File size must be less than ${maxFileSize}MB`);
      } else if (rejection.errors[0]?.code === 'file-invalid-type') {
        setError('Please upload a CSV or Excel file');
      } else {
        setError('Invalid file');
      }
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [onFileSelect, maxFileSize]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    },
    maxSize: maxFileSize * 1024 * 1024, // Convert MB to bytes
    multiple: false,
    disabled: isProcessing
  });

  const clearSelection = () => {
    setSelectedFile(null);
    setError(null);
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (extension === 'csv') {
      return <FileText className="w-8 h-8 text-green-500" />;
    }
    return <FileSpreadsheet className="w-8 h-8 text-blue-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className={cn("w-full", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
          isDragActive && "border-blue-500 bg-blue-50",
          !isDragActive && "border-gray-300 hover:border-gray-400",
          isProcessing && "opacity-50 cursor-not-allowed",
          error && "border-red-300 bg-red-50"
        )}
      >
        <input {...getInputProps()} />
        
        {selectedFile ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              {getFileIcon(selectedFile.name)}
            </div>
            <div>
              <p className="font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
            </div>
            {!isProcessing && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearSelection();
                }}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Upload className={cn(
              "w-12 h-12 mx-auto",
              isDragActive ? "text-blue-500" : "text-gray-400"
            )} />
            <div>
              <p className="text-lg font-medium text-gray-900">
                {isDragActive ? "Drop your file here" : "Drop a CSV or Excel file here"}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                or click to browse (max {maxFileSize}MB)
              </p>
            </div>
            <p className="text-xs text-gray-400">
              Supported formats: CSV, XLS, XLSX
            </p>
          </div>
        )}
        
        {error && (
          <div className="mt-4 flex items-center justify-center text-red-600">
            <AlertCircle className="w-4 h-4 mr-2" />
            <span className="text-sm">{error}</span>
          </div>
        )}
        
        {isProcessing && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-600">Processing file...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}