import { useRef, useState, DragEvent } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { cn } from '~/utils/cn';

interface FileUploadZoneProps {
  onFileUpload: (file: File) => void;
  className?: string;
  isUploading?: boolean;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function FileUploadZone({ onFileUpload, className, isUploading = false }: FileUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const validateFile = (file: File): boolean => {
    setError(null);
    
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      setError(`File "${file.name}" is too large. Maximum size is 50MB.`);
      return false;
    }
    
    // Check file type
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const isValidType = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!isValidType) {
      setError(`File "${file.name}" is not supported. Please upload CSV or Excel files only.`);
      return false;
    }
    
    return true;
  };
  
  const processFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    fileArray.forEach(file => {
      if (validateFile(file)) {
        onFileUpload(file);
      }
    });
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      processFiles(files);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };
  
  return (
    <div className={cn(
      "border-t border-gray-200 p-4 bg-gray-50 bg-theme-bg-primary dark:border-dark-primary",
      className
    )}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        id="file-upload"
        disabled={isUploading}
      />
      <label
        htmlFor="file-upload"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex items-center justify-center gap-2 px-4 py-6",
          "border-2 border-dashed rounded-lg",
          "transition-all duration-200",
          isDragging ? (
            "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
          ) : (
            "border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10"
          ),
          isUploading ? (
            "opacity-50 cursor-not-allowed"
          ) : (
            "cursor-pointer"
          )
        )}
      >
        <Upload className={cn(
          "w-5 h-5",
          isDragging ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
        )} />
        <span className={cn(
          "text-sm",
          isDragging ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-300"
        )}>
          {isDragging ? (
            "Drop files here"
          ) : isUploading ? (
            "Uploading..."
          ) : (
            "Click to upload or drag files here"
          )}
        </span>
      </label>
      
      {error && (
        <div className="mt-2 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <FileSpreadsheet className="w-4 h-4" />
        <span>Supports CSV, Excel, and PDF files (max 50MB)</span>
      </div>
    </div>
  );
}