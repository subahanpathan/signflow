import React, { useEffect, useState, useCallback } from 'react';
import { Plus, LogOut, FileSignature } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DocumentList } from '../components/DocumentList';
import { UploadModal } from '../components/UploadModal';
import api from '../lib/axios';

interface Document {
  _id: string;
  title: string;
  status: 'draft' | 'pending' | 'signed' | 'rejected';
  pageCount: number;
  createdAt: string;
}

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState('');

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get('/docs');
      setDocuments(data.documents);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setError('Could not load documents. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      setError('');
      await api.delete(`/docs/${id}`);
      setDocuments((prev) => prev.filter((d) => d._id !== id));
    } catch (err) {
      console.error('Failed to delete document:', err);
      setError('Could not delete the document. Please try again.');
    }
  };

  const handleUploadSuccess = () => {
    setShowUpload(false);
    fetchDocuments();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xl">
            <FileSignature className="h-6 w-6" />
            SignFlow
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden sm:block">{user?.email}</span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Documents</h1>
            <p className="text-sm text-gray-500 mt-1">
              Upload PDFs and collect signatures digitally.
            </p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New Document
          </button>
        </div>

        {/* Document list card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-2">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-red-800">{error}</p>
                <button onClick={() => setError('')} className="text-red-600 hover:text-red-800 text-sm font-medium">Dismiss</button>
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <DocumentList documents={documents} onDelete={handleDelete} />
          )}
        </div>
      </main>

      {showUpload && <UploadModal onSuccess={handleUploadSuccess} />}
    </div>
  );
};
