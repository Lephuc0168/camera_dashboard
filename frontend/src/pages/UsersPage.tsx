import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { ShieldCheck, UserPlus, Trash2, User, Lock, AlertTriangle, CheckCircle2, Shield, RefreshCw } from 'lucide-react';

interface UserItem {
  user_id: string;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  is_active: boolean;
  created_at: string;
}

export const UsersPage: React.FC = () => {
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

  const [currentRole, setCurrentRole] = useState(getInitialRole);
  const [currentUsername, setCurrentUsername] = useState(localStorage.getItem('username') || '');

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'operator' | 'viewer'>('operator');
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/admin/users');
      setUsers(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load users:', err);
      if (err.response?.status === 404) {
        setError('Backend trên Jetson đang chạy mã nguồn cũ nên chưa có API quản lý tài khoản (/api/auth/admin/users). Hãy chạy 1 dòng lệnh sau trên terminal Jetson để cập nhật ngay: git clone --depth 1 https://github.com/Lephuc0168/camera_dashboard.git /tmp/dash && cp -r /tmp/dash/backend/* ~/open-set-face-recognition/backend/ && rm -rf /tmp/dash');
      } else {
        setError(err.response?.data?.detail || 'Không thể tải danh sách tài khoản từ máy chủ.');
      }
      // Graceful fallback: always display current logged-in admin user
      if (currentRole === 'admin') {
        setUsers([
          {
            user_id: 'current-admin-id',
            username: currentUsername || 'admin',
            role: 'admin',
            is_active: true,
            created_at: new Date().toISOString()
          }
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/auth/me').then(res => {
      if (res.data) {
        if (res.data.role) {
          setCurrentRole(res.data.role);
          localStorage.setItem('user_role', res.data.role);
        }
        if (res.data.username) {
          setCurrentUsername(res.data.username);
          localStorage.setItem('username', res.data.username);
        }
      }
    }).catch(() => {
      if ((localStorage.getItem('username') || '').toLowerCase() === 'admin') {
        setCurrentRole('admin');
        localStorage.setItem('user_role', 'admin');
      }
    });
  }, []);

  useEffect(() => {
    if (currentRole === 'admin') {
      fetchUsers();
    }
  }, [currentRole]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không trùng khớp.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Mật khẩu phải có độ dài tối thiểu 6 ký tự.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/admin/users', {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole
      });

      setSuccess(`Khởi tạo tài khoản "${newUsername}" với vai trò "${newRole.toUpperCase()}" thành công!`);
      setNewUsername('');
      setNewPassword('');
      setConfirmPassword('');
      setShowForm(false);
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Không thể tạo tài khoản. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (username === currentUsername) {
      alert('Bạn không thể tự xóa tài khoản của chính mình.');
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn xóa tài khoản "${username}" không?`)) {
      return;
    }

    try {
      await api.delete(`/auth/admin/users/${userId}`);
      setSuccess(`User account "${username}" deleted successfully.`);
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete user account.');
    }
  };

  if (currentRole !== 'admin') {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{
          maxWidth: '500px',
          margin: '0 auto',
          padding: '32px',
          background: 'rgba(244, 63, 94, 0.1)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          borderRadius: 'var(--radius-lg)'
        }}>
          <AlertTriangle size={48} color="#f43f5e" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f43f5e', marginBottom: '8px' }}>
            Access Restricted (403 Forbidden)
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: 1.5 }}>
            This console is restricted to users with the <strong>Admin</strong> role. Please log in with an administrator account to manage system users.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <ShieldCheck size={26} color="#818cf8" />
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>User Management & RBAC</h1>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Admin Console: Provision, inspect, and manage system user accounts across all 3 roles (Admin, Operator, Viewer)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={fetchUsers}
            className="glass-button"
            style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'white', border: '1px solid var(--border-glass)' }}
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="glass-button"
            style={{
              background: showForm ? 'rgba(244, 63, 94, 0.2)' : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: 'white',
              border: 'none',
              padding: '10px 18px'
            }}
          >
            <UserPlus size={18} /> {showForm ? 'Close' : '+ Create User'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(244, 63, 94, 0.15)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          color: '#f43f5e',
          borderRadius: 'var(--radius-md)',
          marginBottom: '16px',
          fontSize: '0.9rem'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          color: '#10b981',
          borderRadius: 'var(--radius-md)',
          marginBottom: '16px',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={18} /> {success}
        </div>
      )}

      {/* Admin Creation Form Box */}
      {showForm && (
        <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <UserPlus size={20} color="#818cf8" />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Create New User Account (3 Roles Supported)</h3>
          </div>

          <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <User size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '10px', top: '12px' }} />
                <input
                  type="text"
                  placeholder="e.g. operator_01"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 34px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Role
              </label>
              <select
                value={newRole}
                onChange={(e: any) => setNewRole(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: '#111827',
                  border: '1px solid var(--border-glass)',
                  color: 'white',
                  outline: 'none'
                }}
              >
                <option value="operator">Operator (View & Control)</option>
                <option value="admin">Admin (Full Administrative Access)</option>
                <option value="viewer">Viewer (Read-only Stream)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Password (Min 6 characters)
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '10px', top: '12px' }} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 34px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '10px', top: '12px' }} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 34px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={submitting}
                className="glass-button"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '10px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white'
                }}
              >
                {submitting ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={18} color="var(--accent-cyan)" />
          System Accounts ({users.length})
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-dim)' }}>
                <th style={{ padding: '12px' }}>Username</th>
                <th style={{ padding: '12px' }}>Role</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px' }}>Created At</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.username === currentUsername;
                let roleColor = '#94a3b8';
                let roleBg = 'rgba(148, 163, 184, 0.15)';
                if (u.role === 'admin') {
                  roleColor = '#a855f7';
                  roleBg = 'rgba(168, 85, 247, 0.18)';
                } else if (u.role === 'operator') {
                  roleColor = '#06b6d4';
                  roleBg = 'rgba(6, 182, 212, 0.18)';
                }

                return (
                  <tr key={u.user_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '14px 12px', fontWeight: 600, color: 'white' }}>
                      {u.username} {isSelf && <span style={{ fontSize: '0.75rem', color: '#10b981', marginLeft: '6px' }}>(You)</span>}
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: roleColor,
                        background: roleBg,
                        border: `1px solid ${roleColor}40`,
                        textTransform: 'uppercase'
                      }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: u.is_active ? '#10b981' : '#f43f5e', fontSize: '0.85rem' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: u.is_active ? '#10b981' : '#f43f5e' }}></span>
                        {u.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 12px', color: 'var(--text-muted)' }}>
                      {new Date(u.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                      {!isSelf ? (
                        <button
                          onClick={() => handleDeleteUser(u.user_id, u.username)}
                          style={{
                            background: 'rgba(244, 63, 94, 0.12)',
                            border: '1px solid rgba(244, 63, 94, 0.3)',
                            color: '#f43f5e',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.82rem'
                          }}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Default (Protected)</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No other user accounts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
