import React, { useState, useRef } from 'react';
import { UploadCloud, X, FileText, Loader2 } from 'lucide-react';
import api from '../lib/axios';

interface Props {
  onSuccess: () => void;
}

export const UploadModal: React.FC<Props> = ({ onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (selected: File | null) => {
    if (!selected) return;
    if (selected.type !== 'application/pdf') {
      setError('Only PDF files are allowed.');
      return;
    }
    setError('');
    setFile(selected);
    if (!title) setTitle(selected.name.replace(/\.pdf$/i, ''));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    handleFileChange(dropped || null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Please select a PDF file.'); return; }
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('pdf', file);
      form.append('title', title || file.name);
      await api.post('/docs/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 relative">
        <button
          onClick={onSuccess}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-6 w-6" />
        </button>

        <h2 className="text-2xl font-bold text-gray-900 mb-6">Upload Document</h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : file
                ? 'border-green-400 bg-green-50'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3 text-green-700">
                <FileText className="h-8 w-8" />
                <div className="text-left">
                  <p className="font-medium text-sm">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
            ) : (
              <>
                <UploadCloud className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">
                  Drag & drop your PDF here, or <span className="text-blue-600">browse</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">PDF only · Max 20 MB</p>
              </>
            )}
          </div>

          {/* Title input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Document title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Contract Agreement"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={uploading || !file}
            className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
            ) : (
              <><UploadCloud className="h-4 w-4" /> Upload PDF</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
