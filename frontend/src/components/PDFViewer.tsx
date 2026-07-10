import React from 'react';
import type { DocumentItem } from '../types';

interface PDFViewerProps {
  document: DocumentItem;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ document }) => {
  return (
    <div className="p-4 border rounded bg-gray-50 text-center">
      <p className="text-gray-500">PDF Viewer placeholder for {document.title}</p>
    </div>
  );
};
