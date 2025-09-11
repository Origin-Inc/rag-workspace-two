import { useRef } from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';
import { cn } from '~/utils/cn';

interface FileUploadZoneProps {
  onFileUpload: (file: File) => void;
  className?: string;
}

export function FileUploadZone({ onFileUpload, className }: FileUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        if (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          onFileUpload(file);
        } else {
          alert(`File "${file.name}" is not supported. Please upload CSV or Excel files.`);
        }
      });
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  return (
    <div className={cn(
      "border-t border-gray-200 p-4 bg-gray-50",
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
      />
      <label
        htmlFor="file-upload"
        className={cn(
          "flex items-center justify-center gap-2 px-4 py-2",
          "border-2 border-dashed border-gray-300 rounded-lg",
          "hover:border-blue-400 hover:bg-blue-50 cursor-pointer",
          "transition-colors"
        )}
      >
        <Upload className="w-5 h-5 text-gray-500" />
        <span className="text-sm text-gray-600">
          Click to upload or drag files here
        </span>
      </label>
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
        <FileSpreadsheet className="w-4 h-4" />
        <span>Supports CSV and Excel files (max 50MB)</span>
      </div>
    </div>
  );
}