import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { FileSignature, CheckCircle, XCircle, PenTool, Type, Trash2, ArrowRight, AlertTriangle, Upload, ImageIcon } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import api from '../lib/axios';
import type { SignatureField, DocumentItem } from '../types';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export const PublicSigning: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [documentItem, setDocumentItem] = useState<DocumentItem | null>(null);
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [signerEmail, setSignerEmail] = useState<string>('');
  const [numPages, setNumPages] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [signingField, setSigningField] = useState<SignatureField | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalized, setFinalized] = useState(false);

  // Rejection state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejected, setRejected] = useState(false);

  // Signature modal state
  const [signMethod, setSignMethod] = useState<'draw' | 'type' | 'upload'>('draw');
  const [typedName, setTypedName] = useState('');
  const [isSubmittingSig, setIsSubmittingSig] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      alert('Only PNG, JPG, or JPEG images are allowed.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB.');
      return;
    }

    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Canvas drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const fetchSigningDetails = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/public/sign/${token}`);
      setDocumentItem(data.document);
      setFields(data.fields);
      setSignerEmail(data.signerEmail);
    } catch (err) {
      console.error('Failed to fetch public signing details:', err);
      // Wait, if it fails, maybe showing a message is enough
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSigningDetails();
  }, [fetchSigningDetails]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  // ── Canvas Drawing Handlers ────────────────────────────────────────────────
  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set styling
    ctx.strokeStyle = '#0f172a'; // slate-900
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  useEffect(() => {
    if (signingField && signMethod === 'draw') {
      // Small timeout to allow Modal to render canvas
      setTimeout(initCanvas, 50);
    }
  }, [signingField, signMethod]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isDrawingRef.current = true;
    const pos = getCoordinates(e);
    lastPosRef.current = pos;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    lastPosRef.current = pos;
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // ── Signature Submission ───────────────────────────────────────────────────
  const handleSubmitSignature = async () => {
    if (!signingField || !token) return;

    try {
      setIsSubmittingSig(true);
      let file: File | null = null;

      if (signMethod === 'draw') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        file = new File([blob], 'signature.png', { type: 'image/png' });
      } else if (signMethod === 'type') {
        if (!typedName.trim()) {
          alert('Please type your name to sign.');
          return;
        }

        // Render typed text to a canvas
        const canvas = document.createElement('canvas');
        canvas.width = 500;
        canvas.height = 150;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Fill background white
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw styled text
        ctx.font = 'italic 42px Brush Script MT, cursive, sans-serif';
        ctx.fillStyle = '#0f172a'; // slate-900
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(typedName.trim(), canvas.width / 2, canvas.height / 2);

        const dataUrl = canvas.toDataURL('image/png');
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        file = new File([blob], 'signature.png', { type: 'image/png' });
      } else if (signMethod === 'upload') {
        if (!uploadedFile) {
          alert('Please upload or select an image to sign.');
          return;
        }
        file = uploadedFile;
      }

      if (!file) return;

      const formData = new FormData();
      formData.append('signature', file);

      const { data } = await api.post(`/public/sign/${token}/fields/${signingField._id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Update fields state
      setFields((prev) =>
        prev.map((f) => (f._id === signingField._id ? data.field : f))
      );

      // Close modal
      setSigningField(null);
      setTypedName('');
      setUploadedImage(null);
      setUploadedFile(null);
    } catch (err) {
      console.error('Failed to submit signature:', err);
      alert('Failed to save signature. Please try again.');
    } finally {
      setIsSubmittingSig(false);
    }
  };

  // ── Finalize Document ──────────────────────────────────────────────────────
  const handleFinalize = async () => {
    if (!token) return;
    try {
      setIsFinalizing(true);
      await api.post(`/public/sign/${token}/finalize`);
      setFinalized(true);
    } catch (err) {
      console.error('Failed to finalize document:', err);
      alert('Could not finalize document. Ensure all signature fields have been signed.');
    } finally {
      setIsFinalizing(false);
    }
  };

  // ── Reject Document ────────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!token) return;
    try {
      setIsRejecting(true);
      await api.post(`/public/sign/${token}/reject`, { reason: rejectReason.trim() || 'No reason provided' });
      setRejected(true);
      setShowRejectModal(false);
    } catch (err) {
      console.error('Failed to reject document:', err);
      alert('Could not reject the document. Please try again.');
    } finally {
      setIsRejecting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (finalized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100 text-center">
          <div className="h-16 w-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Signing Complete!</h1>
          <p className="text-sm text-gray-500 mb-6">
            Thank you for signing the document. The document owner has been notified and the finalized PDF is sealed.
          </p>
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-400">
            Secure digital audit logging hash verified.
          </div>
        </div>
      </div>
    );
  }

  if (!documentItem) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100 text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">Invalid or Expired Link</h1>
          <p className="text-sm text-gray-500 mb-4">
            This signing link is either invalid, has expired, or has already been completed.
          </p>
        </div>
      </div>
    );
  }

  if (rejected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100 text-center">
          <div className="h-16 w-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="h-10 w-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Document Rejected</h1>
          <p className="text-sm text-gray-500 mb-6">
            You have declined to sign <span className="font-semibold text-gray-700">{documentItem?.title}</span>.
            The document owner has been notified.
          </p>
          <p className="text-xs text-gray-400">
            You may close this window.
          </p>
        </div>
      </div>
    );
  }

  // Count signed and unsigned fields assigned to current signer
  const signerFields = fields.filter((f) => f.signerEmail.toLowerCase() === signerEmail.toLowerCase());
  const unsignedSignerFields = signerFields.filter((f) => f.status === 'unsigned');

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Header Banner */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
            <FileSignature className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">{documentItem.title}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Signing as: <span className="font-semibold text-gray-700">{signerEmail}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {unsignedSignerFields.length === 0 ? (
            <button
              onClick={handleFinalize}
              disabled={isFinalizing}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm shadow-sm transition-colors flex items-center gap-1.5"
            >
              {isFinalizing ? 'Finalizing...' : 'Finish & Finalize'}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
              {unsignedSignerFields.length} field{unsignedSignerFields.length > 1 ? 's' : ''} left to sign
            </span>
          )}
          {/* Decline button — always visible while document is pending */}
          <button
            onClick={() => setShowRejectModal(true)}
            className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg font-medium text-sm transition-colors flex items-center gap-1.5"
          >
            <XCircle className="h-4 w-4" />
            Decline
          </button>
        </div>
      </header>

      {/* Main Canvas Workspace */}
      <main className="flex-1 p-8 overflow-y-auto flex justify-center bg-gray-50">
        <div className="max-w-3xl">
          <Document
            file={documentItem.viewUrl}
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
                <div
                  key={`page-container-${pageNumber}`}
                  className="relative inline-block bg-white shadow-lg border border-gray-200 rounded-lg mb-8"
                >
                  <Page
                    pageNumber={pageNumber}
                    width={600}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    className="rounded-lg"
                  />

                  {/* Render signature fields overlays */}
                  {pageFields.map((f) => {
                    const isMyField = f.signerEmail.toLowerCase() === signerEmail.toLowerCase();
                    const isSigned = f.status === 'signed';

                    const style = {
                      position: 'absolute' as const,
                      left: `${f.x * 100}%`,
                      top: `${f.y * 100}%`,
                      width: `${f.width * 100}%`,
                      height: `${f.height * 100}%`,
                    };

                    if (isSigned) {
                      return (
                        <div
                          key={f._id}
                          style={style}
                          className="absolute border border-green-500 bg-green-50/50 rounded flex items-center justify-center p-1 text-[10px] text-green-700 font-semibold cursor-default"
                        >
                          <CheckCircle className="h-4 w-4 text-green-600 mr-1 flex-shrink-0" />
                          Signed
                        </div>
                      );
                    }

                    if (isMyField) {
                      return (
                        <button
                          key={f._id}
                          style={style}
                          onClick={() => setSigningField(f)}
                          className="absolute border-2 border-dashed border-blue-600 bg-blue-50/30 hover:bg-blue-50/50 rounded flex flex-col items-center justify-center cursor-pointer p-1 text-blue-700 font-semibold ring-2 ring-offset-2 ring-blue-500 animate-pulse"
                        >
                          <FileSignature className="h-4 w-4" />
                          <span className="text-[10px] mt-0.5">Click to Sign</span>
                        </button>
                      );
                    }

                    // Fields for other signers
                    return (
                      <div
                        key={f._id}
                        style={style}
                        className="absolute border border-gray-300 bg-gray-50/60 rounded flex items-center justify-center p-1 text-[8px] text-gray-400 font-medium select-none pointer-events-none"
                        title={`Waiting for ${f.signerEmail}`}
                      >
                        Waiting for: {f.signerEmail.split('@')[0]}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </Document>
        </div>
      </main>

      {/* Signature Capture Modal */}
      {signingField && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 max-w-lg w-full overflow-hidden">
            {/* Modal Tabs */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setSignMethod('draw')}
                className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors ${
                  signMethod === 'draw'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <PenTool className="h-4 w-4" />
                Draw Signature
              </button>
              <button
                onClick={() => setSignMethod('type')}
                className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors ${
                  signMethod === 'type'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Type className="h-4 w-4" />
                Type Signature
              </button>
              <button
                onClick={() => setSignMethod('upload')}
                className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors ${
                  signMethod === 'upload'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Upload className="h-4 w-4" />
                Upload Image
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {signMethod === 'draw' ? (
                <div className="space-y-4">
                  <p className="text-xs text-gray-400 italic">Use your finger or mouse to draw below:</p>
                  <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                    <canvas
                      ref={canvasRef}
                      width={450}
                      height={180}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      className="w-full h-[180px] bg-white cursor-crosshair touch-none"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={clearCanvas}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      Clear Signature
                    </button>
                  </div>
                </div>
              ) : signMethod === 'type' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                      Type Your Name
                    </label>
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={typedName}
                      onChange={(e) => setTypedName(e.target.value)}
                      className="px-4 py-3 w-full border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="border border-gray-200 rounded-xl p-6 bg-gray-50 text-center select-none min-h-[100px] flex items-center justify-center">
                    {typedName.trim() ? (
                      <span className="font-handwriting text-3xl italic text-gray-900 font-serif">
                        {typedName}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400 italic">Signature preview will appear here</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-gray-400 italic">Upload an image file of your signature (PNG, JPG or JPEG):</p>
                  <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:border-blue-500 transition-colors rounded-xl p-6 bg-gray-50 cursor-pointer relative group">
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/jpg"
                      onChange={handleImageChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    {uploadedImage ? (
                      <div className="flex flex-col items-center gap-2">
                        <img
                          src={uploadedImage}
                          alt="Signature Preview"
                          className="max-h-[120px] object-contain border border-gray-200 bg-white p-1 rounded shadow-sm"
                        />
                        <span className="text-xs text-gray-500 font-medium truncate max-w-[200px]">
                          {uploadedFile?.name}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                        <span className="text-xs font-semibold text-gray-700">Click or drag image file here</span>
                        <span className="text-[10px] text-gray-400">PNG, JPG or JPEG up to 5MB</span>
                      </div>
                    )}
                  </div>
                  {uploadedImage && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => {
                          setUploadedImage(null);
                          setUploadedFile(null);
                        }}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove Image
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-100">
              <button
                onClick={() => {
                  setSigningField(null);
                  setTypedName('');
                  setUploadedImage(null);
                  setUploadedFile(null);
                }}
                disabled={isSubmittingSig}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitSignature}
                disabled={isSubmittingSig}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors"
              >
                {isSubmittingSig ? 'Saving...' : 'Sign Field'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject / Decline Modal ─────────────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="h-10 w-10 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Decline to Sign?</h3>
                <p className="text-xs text-gray-500 mt-1">
                  This will mark the document as <span className="font-semibold text-red-600">rejected</span> and notify
                  the sender. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Reason (optional)
              </label>
              <textarea
                rows={3}
                placeholder="e.g. I do not agree with section 3.2..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRejectModal(false)}
                disabled={isRejecting}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isRejecting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                <XCircle className="h-4 w-4" />
                {isRejecting ? 'Declining...' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
