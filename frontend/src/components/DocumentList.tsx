import React from 'react';
import { FileText, Clock, CheckCircle, XCircle, ChevronRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Document {
  _id: string;
  title: string;
  status: 'draft' | 'pending' | 'signed' | 'rejected';
  pageCount: number;
  createdAt: string;
}

interface Props {
  documents: Document[];
  onDelete: (id: string) => void;
}

const statusConfig = {
  draft:    { label: 'Draft',    icon: FileText,     color: 'text-gray-500 bg-gray-100' },
  pending:  { label: 'Pending',  icon: Clock,        color: 'text-yellow-700 bg-yellow-100' },
  signed:   { label: 'Signed',   icon: CheckCircle,  color: 'text-green-700 bg-green-100' },
  rejected: { label: 'Rejected', icon: XCircle,      color: 'text-red-700 bg-red-100' },
};

export const DocumentList: React.FC<Props> = ({ documents, onDelete }) => {
  const navigate = useNavigate();

  if (documents.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <FileText className="h-16 w-16 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">No documents yet</p>
        <p className="text-sm mt-1">Upload your first PDF to get started</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100">
      {documents.map((doc) => {
        const { label, icon: Icon, color } = statusConfig[doc.status];
        return (
          <li
            key={doc._id}
            className="flex items-center gap-4 py-4 px-2 rounded-xl hover:bg-gray-50 group transition-colors cursor-pointer"
            onClick={() => navigate(`/docs/${doc._id}`)}
          >
            <div className="flex-shrink-0 h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{doc.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {doc.pageCount} page{doc.pageCount !== 1 ? 's' : ''} ·{' '}
                {new Date(doc.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}
              </p>
            </div>

            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
              <Icon className="h-3 w-3" />
              {label}
            </span>

            <button
              onClick={(e) => { e.stopPropagation(); onDelete(doc._id); }}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1 rounded"
              title="Delete document"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
          </li>
        );
      })}
    </ul>
  );
};
