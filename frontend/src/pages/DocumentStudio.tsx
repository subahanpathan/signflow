import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Trash2, Mail, Copy, Check, FileSignature, ExternalLink, ClipboardList, XCircle } from 'lucide-react';
import { DndContext, useDraggable, useDroppable, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { Document, Page, pdfjs } from 'react-pdf';
import api from '../lib/axios';
import type { DocumentItem, SignatureField, AuditLog } from '../types';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

// ── Draggable Sidebar Item ───────────────────────────────────────────────────
const DraggableFieldButton: React.FC = () => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'palette-signature-field',
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`p-4 border-2 border-dashed rounded-xl bg-blue-50/50 border-blue-300 hover:border-blue-500 hover:bg-blue-50 text-blue-700 font-medium cursor-grab active:cursor-grabbing flex items-center justify-center gap-2 transition-all ${
        isDragging ? 'opacity-30 border-blue-200 bg-gray-50 text-blue-400 select-none' : ''
      }`}
    >
      <FileSignature className="h-5 w-5 flex-shrink-0" />
      <span>Signature Field</span>
    </div>
  );
};

// ── Droppable PDF Page Wrapper ────────────────────────────────────────────────
interface PageDroppableProps {
  pageNumber: number;
  children: React.ReactNode;
}

const PageDroppable: React.FC<PageDroppableProps> = ({ pageNumber, children }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `page-${pageNumber}`,
    data: { pageNumber },
  });

  return (
    <div
      ref={setNodeRef}
      id={`page-container-${pageNumber}`}
      className={`relative inline-block bg-white shadow-lg border rounded-lg transition-shadow duration-200 ${
        isOver ? 'ring-2 ring-blue-500 shadow-xl' : 'border-gray-200 shadow-md'
      }`}
    >
      {children}
    </div>
  );
};

// ── Draggable Placed Signature Field Overlay ───────────────────────────────────
interface DraggablePlacedFieldProps {
  field: SignatureField;
  isSelected: boolean;
  disabled: boolean;
  onClick: () => void;
  onDelete: () => void;
}

const DraggablePlacedField: React.FC<DraggablePlacedFieldProps> = ({
  field,
  isSelected,
  disabled,
  onClick,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: field._id,
    disabled: disabled,
  });

  const style = {
    position: 'absolute' as const,
    left: `${field.x * 100}%`,
    top: `${field.y * 100}%`,
    width: `${field.width * 100}%`,
    height: `${field.height * 100}%`,
    zIndex: 20,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    cursor: disabled ? 'default' : isDragging ? 'grabbing' : 'grab',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute border-2 border-dashed rounded flex flex-col items-center justify-center select-none p-1 group touch-none ${
        isSelected
          ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-300'
          : 'border-blue-400 bg-blue-50/20 hover:border-blue-600 hover:bg-blue-50/30'
      } ${isDragging ? 'opacity-30' : ''}`}
    >
      <FileSignature className="h-4 w-4 text-blue-600" />
      <span className="text-[10px] font-semibold text-blue-700 mt-0.5 truncate max-w-full">
        {field.signerEmail ? field.signerEmail.split('@')[0] : 'Sign Here'}
      </span>
      {!disabled && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-30 cursor-pointer"
        >
          <XCircle className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

// ── Document Studio Page Component ──────────────────────────────────────────
export const DocumentStudio: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [documentItem, setDocumentItem] = useState<DocumentItem | null>(null);
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [selectedField, setSelectedField] = useState<SignatureField | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [signingLinks, setSigningLinks] = useState<{ email: string; link: string }[]>([]);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Signer email edit state
  const [signerEmailInput, setSignerEmailInput] = useState('');

  // Right panel tab
  const [rightTab, setRightTab] = useState<'properties' | 'audit'>('properties');

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchAuditLogs = useCallback(async () => {
    if (!id) return;
    try {
      setAuditLoading(true);
      const { data } = await api.get(`/docs/${id}/audit`);
      setAuditLogs(data.logs);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setAuditLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (rightTab === 'audit') fetchAuditLogs();
  }, [rightTab, fetchAuditLogs]);

  const fetchDocumentData = useCallback(async () => {
    try {
      setLoading(true);
      const [docRes, fieldsRes] = await Promise.all([
        api.get(`/docs/${id}`),
        api.get(`/docs/${id}/fields`),
      ]);
      setDocumentItem(docRes.data.document);
      setFields(fieldsRes.data.fields);
    } catch (err) {
      console.error('Failed to load document studio data:', err);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchDocumentData();
  }, [fetchDocumentData]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  // Drag and drop drop handler
  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over, delta } = event;
    setActiveId(null);
    if (!over || !documentItem) return;

    const pageNumber = over.data.current?.pageNumber as number;
    const pageElement = document.getElementById(`page-container-${pageNumber}`);
    if (!pageElement) return;

    const rect = pageElement.getBoundingClientRect();
    const mouseEvent = event.activatorEvent as MouseEvent;
    if (!mouseEvent) return;

    if (active.id === 'palette-signature-field') {
      // 1. Placing a NEW signature field
      const dropX = mouseEvent.clientX + delta.x;
      const dropY = mouseEvent.clientY + delta.y;

      const x = (dropX - rect.left) / rect.width;
      const y = (dropY - rect.top) / rect.height;

      const normalisedX = Math.max(0, Math.min(1 - 0.25, x));
      const normalisedY = Math.max(0, Math.min(1 - 0.06, y));

      const payload = {
        page: pageNumber,
        x: normalisedX,
        y: normalisedY,
        width: 0.25,
        height: 0.06,
        signerEmail: '',
      };

      try {
        const { data } = await api.post(`/docs/${id}/fields`, payload);
        setFields((prev) => [...prev, data.field]);
        setSelectedField(data.field);
        setSignerEmailInput('');
      } catch (err) {
        console.error('Failed to place signature field:', err);
      }
    } else {
      // 2. Repositioning an EXISTING field
      const fieldId = active.id as string;
      const existingField = fields.find((f) => f._id === fieldId);
      if (!existingField) return;

      const initialPageElement = document.getElementById(`page-container-${existingField.page}`);
      if (!initialPageElement) return;

      const initialRect = initialPageElement.getBoundingClientRect();
      const startX = initialRect.left + existingField.x * initialRect.width;
      const startY = initialRect.top + existingField.y * initialRect.height;

      const dropX = startX + delta.x;
      const dropY = startY + delta.y;

      const x = (dropX - rect.left) / rect.width;
      const y = (dropY - rect.top) / rect.height;

      const normalisedX = Math.max(0, Math.min(1 - existingField.width, x));
      const normalisedY = Math.max(0, Math.min(1 - existingField.height, y));

      // Optimistically update the UI position immediately
      setFields((prev) =>
        prev.map((f) =>
          f._id === fieldId
            ? { ...f, page: pageNumber, x: normalisedX, y: normalisedY }
            : f
        )
      );

      try {
        const { data } = await api.patch(`/docs/${id}/fields/${fieldId}`, {
          page: pageNumber,
          x: normalisedX,
          y: normalisedY,
        });
        // Sync selected field if it was the one dragged
        if (selectedField?._id === fieldId) {
          setSelectedField(data.field);
        }
      } catch (err) {
        console.error('Failed to update field position:', err);
        // Rollback on error
        fetchDocumentData();
      }
    }
  };

  const handleUpdateFieldEmail = async () => {
    if (!selectedField || !documentItem) return;

    try {
      const { data } = await api.patch(`/docs/${id}/fields/${selectedField._id}`, {
        signerEmail: signerEmailInput.trim(),
      });

      setFields((prev) =>
        prev.map((f) => (f._id === selectedField._id ? data.field : f))
      );
      setSelectedField(data.field);
      alert('Signer email updated!');
    } catch (err) {
      console.error('Failed to update signer email:', err);
      alert('Failed to update signer email. Please ensure it is a valid email format.');
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!documentItem) return;
    try {
      await api.delete(`/docs/${id}/fields/${fieldId}`);
      setFields((prev) => prev.filter((f) => f._id !== fieldId));
      if (selectedField?._id === fieldId) {
        setSelectedField(null);
        setSignerEmailInput('');
      }
    } catch (err) {
      console.error('Failed to delete field:', err);
    }
  };

  const handleSelectField = (field: SignatureField) => {
    setSelectedField(field);
    setSignerEmailInput(field.signerEmail || '');
  };

  const handleGenerateLinks = async () => {
    if (!documentItem) return;

    // Check if any fields are unassigned
    const unassigned = fields.some((f) => !f.signerEmail);
    if (unassigned) {
      alert('Please assign a signer email to all signature fields before publishing.');
      return;
    }

    try {
      setSharing(true);
      const { data } = await api.post(`/docs/${id}/share`);
      setSigningLinks(data.links);
    } catch (err) {
      console.error('Failed to generate signing links:', err);
      alert('Failed to generate signing links. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  const copyToClipboard = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(link);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!documentItem) return null;

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="min-h-screen flex flex-col bg-gray-100">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{documentItem.title}</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Status: <span className="capitalize font-semibold text-blue-600">{documentItem.status}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {documentItem.status === 'draft' || documentItem.status === 'pending' ? (
              <button
                onClick={handleGenerateLinks}
                disabled={fields.length === 0 || sharing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm shadow-sm transition-colors"
              >
                {sharing ? 'Publishing...' : 'Publish & Share'}
              </button>
            ) : null}
          </div>
        </header>

        {/* Workspace body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel (Palette / Toolbar) */}
          <aside className="w-80 bg-white border-r border-gray-200 p-6 flex flex-col gap-6 overflow-y-auto">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Field Palette</h2>
              <p className="text-xs text-gray-500 mb-4">
                Drag the signature field onto the document page to place it.
              </p>
              {documentItem.status === 'draft' || documentItem.status === 'pending' ? (
                <DraggableFieldButton />
              ) : (
                <div className="p-4 bg-gray-50 text-gray-500 rounded-xl text-center text-sm border-2 border-dashed border-gray-200">
                  Editing is disabled on finalized documents
                </div>
              )}
            </div>

            <hr className="border-gray-100" />

            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Fields Placed</h2>
              {fields.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No fields placed yet.</p>
              ) : (
                <ul className="space-y-2">
                  {fields.map((f, idx) => (
                    <li
                      key={f._id}
                      onClick={() => handleSelectField(f)}
                      className={`flex items-center justify-between p-3 rounded-lg border text-sm cursor-pointer transition-colors ${
                        selectedField?._id === f._id
                          ? 'border-blue-500 bg-blue-50/50 text-blue-900'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">Field #{idx + 1} (Page {f.page})</p>
                        <p className="text-xs text-gray-500 truncate">
                          {f.signerEmail || 'Unassigned'}
                        </p>
                      </div>
                      {documentItem.status === 'draft' || documentItem.status === 'pending' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteField(f._id);
                          }}
                          className="text-gray-400 hover:text-red-500 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          {/* PDF View (Center Panel) */}
          <main className="flex-1 p-8 overflow-y-auto flex justify-center bg-gray-50">
            <div className="max-w-3xl">
              <Document
                file={documentItem.viewUrl || ''}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={
                  <div className="flex flex-col items-center justify-center p-20 gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                    <p className="text-sm text-gray-500">Loading document pages...</p>
                  </div>
                }
              >
                {Array.from(new Array(numPages), (_, i) => {
                  const pageNumber = i + 1;
                  const pageFields = fields.filter((f) => f.page === pageNumber);

                  return (
                    <PageDroppable key={`page-wrapper-${pageNumber}`} pageNumber={pageNumber}>
                      <Page
                        pageNumber={pageNumber}
                        width={600}
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                        className="rounded-lg shadow-sm"
                      />
                      {/* Render fields over page */}
                      {pageFields.map((f) => (
                        <DraggablePlacedField
                          key={f._id}
                          field={f}
                          isSelected={selectedField?._id === f._id}
                          disabled={documentItem.status !== 'draft' && documentItem.status !== 'pending'}
                          onClick={() => handleSelectField(f)}
                          onDelete={() => handleDeleteField(f._id)}
                        />
                      ))}
                    </PageDroppable>
                  );
                })}
              </Document>
            </div>
          </main>

          {/* Right panel (Properties / Audit Trail) */}
          <aside className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-gray-200 flex-shrink-0">
              <button
                onClick={() => setRightTab('properties')}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  rightTab === 'properties'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}
              >
                <FileSignature className="h-3.5 w-3.5" />
                Properties
              </button>
              <button
                onClick={() => setRightTab('audit')}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  rightTab === 'audit'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Audit Trail
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6">
              {rightTab === 'properties' ? (
                selectedField ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase">Page</label>
                      <p className="mt-1 text-sm font-medium text-gray-900">{selectedField.page}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase">Position</label>
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        X: {Math.round(selectedField.x * 100)}%, Y: {Math.round(selectedField.y * 100)}%
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                        Signer Email Address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <input
                          type="email"
                          placeholder="signer@example.com"
                          value={signerEmailInput}
                          onChange={(e) => setSignerEmailInput(e.target.value)}
                          disabled={documentItem.status !== 'draft' && documentItem.status !== 'pending'}
                          className="pl-9 pr-3 py-2 w-full border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                        />
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">
                        The person who needs to sign at this location.
                      </p>
                    </div>

                    {documentItem.status === 'draft' || documentItem.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          onClick={handleUpdateFieldEmail}
                          className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-xs shadow-sm transition-colors"
                        >
                          Apply Changes
                        </button>
                        <button
                          onClick={() => handleDeleteField(selectedField._id)}
                          className="p-2 border border-red-200 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                          title="Delete field"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-center text-gray-400 italic text-sm">
                    Select a field on the document to edit its properties.
                  </div>
                )
              ) : (
                /* Audit Trail tab */
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Audit Trail</h2>
                    <button
                      onClick={fetchAuditLogs}
                      className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                    >
                      Refresh
                    </button>
                  </div>
                  {auditLoading ? (
                    <div className="flex justify-center py-10">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                    </div>
                  ) : auditLogs.length === 0 ? (
                    <p className="text-xs text-gray-400 italic text-center py-8">No audit events yet.</p>
                  ) : (
                    <ol className="relative border-l border-gray-200 space-y-4">
                      {auditLogs.map((log) => (
                        <li key={log._id} className="ml-4">
                          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500" />
                          <p className="text-[11px] font-semibold text-gray-700 capitalize">
                            {log.action.replace(/_/g, ' ')}
                          </p>
                          <p className="text-[10px] text-gray-500 truncate">{log.actorEmail}</p>
                          <p className="text-[10px] text-gray-400">
                            {new Date(log.createdAt).toLocaleString()}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Sharing/Signing Links Modal */}
        {signingLinks.length > 0 && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-lg w-full p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Document Published!</h3>
              <p className="text-sm text-gray-500 mb-6">
                Copy the signing links below and share them with the respective signers:
              </p>

              <div className="space-y-4">
                {signingLinks.map((linkData, idx) => (
                  <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-gray-500 truncate max-w-[200px]">
                        {linkData.email}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyToClipboard(linkData.link)}
                          className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-semibold"
                        >
                          {copiedLink === linkData.link ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-green-600" />
                              <span className="text-green-600">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>
                        <a
                          href={linkData.link}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 font-semibold border-l border-gray-300 pl-2"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Open</span>
                        </a>
                      </div>
                    </div>
                    <input
                      type="text"
                      readOnly
                      value={linkData.link}
                      className="w-full bg-white border border-gray-200 rounded px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    setSigningLinks([]);
                    fetchDocumentData();
                  }}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drag overlay to ensure dragging element is painted on top of everything without boundary clipping */}
      <DragOverlay dropAnimation={null}>
        {activeId === 'palette-signature-field' ? (
          <div className="p-4 border-2 border-dashed rounded-xl bg-blue-100 border-blue-500 text-blue-800 font-semibold flex items-center justify-center gap-2 shadow-lg opacity-95 cursor-grabbing z-[100]">
            <FileSignature className="h-5 w-5 flex-shrink-0" />
            <span>Signature Field</span>
          </div>
        ) : activeId ? (
          <div className="border-2 border-dashed border-blue-600 bg-blue-100/80 rounded flex flex-col items-center justify-center p-1 text-blue-800 font-semibold shadow-lg opacity-95 cursor-grabbing z-[100] w-[150px] h-[36px]">
            <FileSignature className="h-4 w-4 text-blue-600" />
            <span className="text-[10px] font-semibold text-blue-700 mt-0.5 truncate max-w-full">
              {fields.find((f) => f._id === activeId)?.signerEmail
                ? fields.find((f) => f._id === activeId)?.signerEmail.split('@')[0]
                : 'Sign Here'}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
