import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Person } from '../types';
import { UserPlus, Users, Trash2 } from 'lucide-react';

export const PersonsPage: React.FC = () => {
  const [persons, setPersons] = useState<Person[]>([]);
  const [fullName, setFullName] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchPersons = async () => {
    try {
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

  const handleCreatePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName) return;

    try {
      await api.post('/persons', {
        full_name: fullName,
        student_code: studentCode || null,
        status: 'active'
      });
      setFullName('');
      setStudentCode('');
      setShowAddModal(false);
      fetchPersons();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to enroll person');
    }
  };

  const handleDeletePerson = async (personId: string) => {
    if (!confirm('Are you sure you want to delete this enrolled person?')) return;
    try {
      await api.delete(`/persons/${personId}`);
      fetchPersons();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700 }}>Enrolled Persons Gallery</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Registered target identities loaded into Jetson PostgreSQL and runtime embedding matrix
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="glass-button">
          <UserPlus size={18} /> Enroll New Identity
        </button>
      </div>

      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '28px' }}>
            <h3 style={{ marginBottom: '20px' }}>Enroll Target Identity</h3>
            <form onSubmit={handleCreatePerson}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Full Name *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="e.g. Le Thien Phuc"
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Student / Staff Code</label>
                <input
                  type="text"
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                  placeholder="e.g. 2200006549"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="glass-button" style={{ background: 'none', border: '1px solid var(--border-glass)' }}>
                  Cancel
                </button>
                <button type="submit" className="glass-button">
                  Save Identity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ padding: '24px' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Full Name</th>
              <th>Student / Staff Code</th>
              <th>Status</th>
              <th>Embeddings Registered</th>
              <th>Enrolled Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {persons.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '32px' }}>
                  No enrolled persons found in database.
                </td>
              </tr>
            ) : (
              persons.map((p) => (
                <tr key={p.person_id}>
                  <td style={{ fontWeight: 600 }}>{p.full_name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{p.student_code || 'N/A'}</td>
                  <td>
                    <span className="badge badge-known">{p.status.toUpperCase()}</span>
                  </td>
                  <td>{p.embedding_count} vectors</td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <button
                      onClick={() => handleDeletePerson(p.person_id)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer' }}
                      title="Delete Person"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
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
  outline: 'none'
};
