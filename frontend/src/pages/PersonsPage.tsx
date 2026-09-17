import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { Person } from '../types';
import { 
  UserPlus, 
  Trash2, 
  Camera, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Sparkles, 
  ShieldCheck,
  RefreshCw,
  X
} from 'lucide-react';

export const PersonsPage: React.FC = () => {
  const [persons, setPersons] = useState<Person[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [fullName, setFullName] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [reloadingGallery, setReloadingGallery] = useState(false);

  const getInitialRole = () => {
    const u = localStorage.getItem('username') || '';
    if (u.toLowerCase() === 'admin') return 'admin';
    let r = localStorage.getItem('user_role');
    if (!r || r === 'viewer') {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload.role) return payload.role;
        } catch(e) {}
      }
    }
    return r || 'viewer';
  };

  const userRole = (localStorage.getItem('user_role') || getInitialRole()).toLowerCase();
  const username = (localStorage.getItem('username') || '').toLowerCase();
  const isAdmin = userRole === 'admin' || username === 'admin';
  const isOperatorOrAdmin = isAdmin || userRole === 'operator';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const fetchPersons = async () => {
    try {
      setLoading(true);
      const response = await api.get('/persons');
      setPersons(response.data);
    } catch (err) {
      console.error('Failed to fetch persons:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPersons();
  }, []);

  // Cleanup camera stream when closing modal or unmounting
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Bind media stream to video element when camera becomes active
  useEffect(() => {
    if (isCameraActive && videoRef.current && mediaStreamRef.current) {
      const video = videoRef.current;
      video.srcObject = mediaStreamRef.current;
      video.onloadedmetadata = () => {
        video.play()
          .then(() => {
            setCameraLoading(false);
            setIsCameraReady(true);
          })
          .catch((err) => {
            console.error('Video play error:', err);
            setErrorMsg('Webcam stream play failed: ' + err.message);
            setCameraLoading(false);
          });
      };
    }
  }, [isCameraActive]);

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
    setCameraLoading(false);
    setIsCameraReady(false);
  };

  const startCamera = async () => {
    try {
      setErrorMsg(null);
      setCameraLoading(true);
      setIsCameraReady(false);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280, min: 640 }, 
          height: { ideal: 720, min: 480 }, 
          facingMode: 'user' 
        }
      });
      mediaStreamRef.current = stream;
      setIsCameraActive(true);
    } catch (err: any) {
      setErrorMsg('Cannot access webcam: ' + (err.message || 'Permission denied or camera not found'));
      setIsCameraActive(false);
      setCameraLoading(false);
      setIsCameraReady(false);
    }
  };

  const captureCameraFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    
    // Ensure the stream has rendered frames
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
      setErrorMsg('Camera stream not ready yet. Please wait a moment.');
      return;
    }

    const minDim = Math.min(video.videoWidth, video.videoHeight);
    const startX = (video.videoWidth - minDim) / 2;
    const startY = (video.videoHeight - minDim) / 2;

    const canvas = document.createElement('canvas');
    const targetSize = 512;
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally to match the mirrored selfie view
    ctx.translate(targetSize, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, targetSize, targetSize);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `webcam_portrait_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setSelectedFile(file);
        setPreviewUrl(canvas.toDataURL('image/jpeg', 0.95));
        stopCamera();
      }
    }, 'image/jpeg', 0.95);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
      stopCamera();
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    stopCamera();
    setFullName('');
    setStudentCode('');
    setSelectedFile(null);
    setPreviewUrl(null);
    setErrorMsg(null);
  };

  const handleEnrollPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMsg('Please provide a full name for the identity.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);

      // 1. Attempt Spec Section 25 full enrollment (Photo + Quality Gate + 512D ArcFace + Global EVT)
      try {
        const formData = new FormData();
        formData.append('full_name', fullName.trim());
        if (studentCode.trim()) {
          formData.append('student_code', studentCode.trim());
        }
        formData.append('status_str', 'active');
        if (selectedFile) {
          formData.append('photo', selectedFile);
        }

        const res = await api.post('/persons/enroll', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        setSuccessMsg(`Identity '${res.data.full_name}' enrolled successfully with 512D unit embedding and Global EVT Fallback!`);
        setTimeout(() => setSuccessMsg(null), 5000);
        handleCloseModal();
        await fetchPersons();
        return;
      } catch (enrollErr: any) {
        const status = enrollErr.response?.status;
        // If 405 (Method Not Allowed) or 404 (Not Found), backend hasn't been synced; fallback to /persons
        if (status === 405 || status === 404) {
          console.warn('/persons/enroll returned HTTP ' + status + ', attempting metadata registration fallback...');
          const fallbackRes = await api.post('/persons', {
            full_name: fullName.trim(),
            student_code: studentCode.trim() || undefined,
            status: 'active'
          });

          setSuccessMsg(
            `Identity '${fallbackRes.data.full_name}' registered successfully! (Note: Update backend on Jetson to enable live photo embedding).`
          );
          setTimeout(() => setSuccessMsg(null), 6000);
          handleCloseModal();
          await fetchPersons();
          return;
        }
        // Rethrow other errors (e.g. Quality Gate validation error, duplicate code)
        throw enrollErr;
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'Failed to enroll person';
      setErrorMsg(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePerson = async (personId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete enrolled identity '${name}'? This will remove all associated embeddings.`)) return;
    try {
      await api.delete(`/persons/${personId}`);
      fetchPersons();
    } catch (err: any) {
      alert('Delete failed: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleReloadGallery = async () => {
    try {
      setReloadingGallery(true);
      setErrorMsg(null);
      const res = await api.get('/persons/gallery/reload');
      setSuccessMsg(res.data?.message || 'Gallery runtime matrix successfully reloaded from database.');
      setTimeout(() => setSuccessMsg(null), 5000);
      await fetchPersons();
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'Failed to reload gallery';
      setErrorMsg('Reload gallery error: ' + detail);
    } finally {
      setReloadingGallery(false);
    }
  };

  const handleToggleStatus = async (personId: string, currentStatus: string) => {
    if (!isOperatorOrAdmin) return;
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await api.patch(`/persons/${personId}/status`, { status: newStatus });
      setPersons(prev => prev.map(p => p.person_id === personId ? { ...p, status: newStatus } : p));
      setSuccessMsg(`Status updated to ${newStatus.toUpperCase()}`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'Failed to change status';
      alert(detail);
    }
  };

  const filteredPersons = persons.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.full_name.toLowerCase().includes(q) || (p.student_code || '').toLowerCase().includes(q);
  });

  return (
    <div>
      {/* Header section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700 }}>Enrolled Persons Gallery</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Registered target identities loaded into Jetson PostgreSQL and runtime embedding matrix (Spec Section 25)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {isAdmin && (
            <button 
              onClick={handleReloadGallery}
              disabled={reloadingGallery}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              title="Admin only: Reload runtime gallery matrix from database"
            >
              <RefreshCw size={16} className={reloadingGallery ? 'spin' : ''} />
              {reloadingGallery ? 'Reloading...' : 'Reload Gallery'}
            </button>
          )}
          {isOperatorOrAdmin && (
            <button 
              onClick={() => {
                setShowAddModal(true);
                setErrorMsg(null);
              }} 
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <UserPlus size={18} /> Enroll New Identity
            </button>
          )}
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid var(--accent-green)',
          color: '#34d399',
          fontSize: '0.9rem'
        }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Search Bar & Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: '320px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or student code..."
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-glass)',
              color: 'white',
              fontSize: '0.85rem',
              outline: 'none'
            }}
          />
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
          Showing <strong>{filteredPersons.length}</strong> of <strong>{persons.length}</strong> enrolled identities
        </div>
      </div>

      {/* Enroll Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 300,
          padding: '16px'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '520px', padding: '28px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Enroll Target Identity</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Face extraction, Quality Gate filtering, and 512D unit vector embedding
                </p>
              </div>
              <button 
                onClick={handleCloseModal}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {errorMsg && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid var(--accent-rose)',
                color: '#f87171',
                fontSize: '0.85rem'
              }}>
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleEnrollPerson}>
              {/* Photo Input Area */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
                  Face Portrait Photo (Quality Gate Required)
                </label>

                {/* Preview or Camera View */}
                <div style={{
                  border: '2px dashed var(--border-glass)',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center',
                  background: 'rgba(255, 255, 255, 0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                  position: 'relative'
                }}>
                  {isCameraActive ? (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: '360px',
                        height: '260px',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        background: '#090d16',
                        border: '2px solid var(--border-glass-accent)',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
                      }}>
                        <video 
                          ref={videoRef} 
                          autoPlay
                          playsInline 
                          muted 
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            objectFit: 'cover',
                            transform: 'scaleX(-1)' // Mirror selfie view
                          }} 
                        />
                        {/* Target Face Oval Frame Guide */}
                        <div style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          width: '160px',
                          height: '200px',
                          border: '2px dashed var(--accent-cyan)',
                          borderRadius: '50%',
                          boxShadow: '0 0 20px rgba(6, 182, 212, 0.35)',
                          pointerEvents: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <div style={{
                            position: 'absolute',
                            bottom: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: 'var(--accent-cyan)',
                            background: 'rgba(0, 0, 0, 0.65)',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            backdropFilter: 'blur(4px)'
                          }}>
                            Center Face Here
                          </div>
                        </div>

                        {cameraLoading && (
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(0,0,0,0.75)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            color: 'var(--text-muted)'
                          }}>
                            <RefreshCw size={24} className="spin" color="var(--primary)" />
                            <span style={{ fontSize: '0.85rem' }}>Initializing Camera...</span>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                        <button 
                          type="button" 
                          onClick={captureCameraFrame} 
                          disabled={!isCameraReady}
                          className="btn btn-primary"
                          style={{ fontSize: '0.85rem' }}
                        >
                          <Camera size={16} /> Snap Photo
                        </button>
                        <button 
                          type="button" 
                          onClick={stopCamera} 
                          className="btn btn-secondary"
                          style={{ fontSize: '0.85rem' }}
                        >
                          Cancel Camera
                        </button>
                      </div>
                    </div>
                  ) : previewUrl ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <div style={{ position: 'relative' }}>
                        <img 
                          src={previewUrl} 
                          alt="Face Preview" 
                          style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary)' }} 
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFile(null);
                            setPreviewUrl(null);
                          }}
                          style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            background: 'var(--accent-rose)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--accent-green)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <ShieldCheck size={14} /> Photo selected ({selectedFile?.name})
                      </span>
                    </div>
                  ) : (
                    <div style={{ padding: '16px 0' }}>
                      <Camera size={36} style={{ opacity: 0.3, marginBottom: '8px' }} />
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '4px' }}>
                        Upload a front-facing face portrait
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '12px' }}>
                        JPG or PNG • Clear lighting • Sharp focus (&gt; 40px)
                      </p>
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                        <input
                          type="file"
                          ref={fileInputRef}
                          style={{ display: 'none' }}
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleFileChange}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="btn btn-secondary"
                          style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <Upload size={14} /> Upload Image
                        </button>
                        <button
                          type="button"
                          onClick={startCamera}
                          className="btn btn-secondary"
                          style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <Camera size={14} /> Use Webcam
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Full Name Input */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="e.g. Le Thien Phuc"
                  style={inputStyle}
                />
              </div>

              {/* Student/Staff Code Input */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                  Student / Staff Code
                </label>
                <input
                  type="text"
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                  placeholder="e.g. 2200006549"
                  style={inputStyle}
                />
              </div>

              {/* EVT Compliance Badge */}
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                fontSize: '0.8rem',
                color: 'var(--accent-cyan)'
              }}>
                <Sparkles size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong>EVT Section 25 Rule:</strong> Newly enrolled identities will operate under the <strong>Global EVT Fallback threshold (0.265)</strong> until sufficient impostor score evidence is gathered for an offline GPD refit.
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  onClick={handleCloseModal} 
                  disabled={submitting}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      Analyzing & Enrolling...
                    </>
                  ) : (
                    <>
                      <UserPlus size={16} />
                      Save & Enroll Identity
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Gallery Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Profile & Identity</th>
              <th>Student / Staff Code</th>
              <th>Status</th>
              <th>Embedding Vectors</th>
              <th>Threshold Mode</th>
              <th>Enrolled Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '32px' }}>
                  Loading enrolled identities...
                </td>
              </tr>
            ) : filteredPersons.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px' }}>
                  <UserPlus size={36} style={{ opacity: 0.3, marginBottom: '8px' }} />
                  <p style={{ color: 'var(--text-main)', fontWeight: 600 }}>No enrolled identities found</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {searchQuery ? 'Try changing your search query' : 'Click "Enroll New Identity" to register the first person.'}
                  </p>
                </td>
              </tr>
            ) : (
              filteredPersons.map((p) => {
                const initials = p.full_name
                  .split(' ')
                  .map((w) => w[0])
                  .filter(Boolean)
                  .slice(-2)
                  .join('')
                  .toUpperCase() || 'ID';

                return (
                  <tr key={p.person_id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {p.photo_url ? (
                          <img
                            src={p.photo_url}
                            alt={p.full_name}
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: '2px solid var(--border-glass)'
                            }}
                            onError={(e) => {
                              // Fallback if image fails to load
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-cyan) 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            color: 'white'
                          }}>
                            {initials}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{p.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>ID: {p.person_id.slice(0, 8)}...</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {p.student_code || 'N/A'}
                    </td>
                    <td>
                      {isOperatorOrAdmin ? (
                        <button
                          onClick={() => handleToggleStatus(p.person_id, p.status)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            textAlign: 'left'
                          }}
                          title="Click to toggle status (Operator+)"
                        >
                          <span 
                            className={`badge ${p.status === 'active' ? 'badge-known' : 'badge-abstain'}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            {p.status.toUpperCase()} <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>⇄</span>
                          </span>
                        </button>
                      ) : (
                        <span className={`badge ${p.status === 'active' ? 'badge-known' : 'badge-abstain'}`}>
                          {p.status.toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: p.embedding_count > 0 ? 'var(--accent-cyan)' : 'var(--accent-amber)' }}>
                        {p.embedding_count} vectors (512D)
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        background: 'rgba(6, 182, 212, 0.12)',
                        color: 'var(--accent-cyan)',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <ShieldCheck size={12} /> Global EVT Fallback
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      {isAdmin ? (
                        <button
                          onClick={() => handleDeletePerson(p.person_id, p.full_name)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-rose)',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '4px'
                          }}
                          title="Hard Delete Person (Admin only)"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 'var(--radius-md)',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid var(--border-glass)',
  color: 'white',
  outline: 'none',
  fontSize: '0.9rem'
};
