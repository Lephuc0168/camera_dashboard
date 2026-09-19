import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { ShieldAlert, Lock, User as UserIcon, Settings, KeyRound, UserPlus, ArrowLeft, CheckCircle2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');

  // Login fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Forgot password fields
  const [resetUsername, setResetUsername] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Common states
  const [serverIp, setServerIp] = useState(
    localStorage.getItem('custom_backend_ip') || (window.location.hostname ? `${window.location.hostname}:8000` : 'localhost:8000')
  );
  const [showIpConfig, setShowIpConfig] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSaveIp = () => {
    localStorage.setItem('custom_backend_ip', serverIp);
    window.location.reload();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const response = await api.post('/auth/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const token = response.data.access_token;
      localStorage.setItem('access_token', token);

      let finalRole = response.data.role;
      // Decode JWT token payload if role is missing
      if (!finalRole && token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload.role) {
            finalRole = payload.role;
          }
        } catch (e) {
          console.warn('Could not decode JWT payload', e);
        }
      }
      // If still missing, check username
      if (!finalRole) {
        finalRole = (username.trim().toLowerCase() === 'admin') ? 'admin' : 'viewer';
      }

      const finalUsername = response.data.username || username;
      localStorage.setItem('username', finalUsername);
      localStorage.setItem('user_role', finalRole);

      // Background verify with /auth/me
      try {
        const meRes = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (meRes.data?.role) {
          localStorage.setItem('user_role', meRes.data.role);
        }
      } catch (e) {
        // Fallback already saved
      }

      navigate('/dashboard');
    } catch (err: any) {
      if (!err.response) {
        setError(`Cannot connect to Jetson API (${api.defaults.baseURL}). Please check if Backend is running or if Jetson IP has changed.`);
      } else {
        setError(err.response.data?.detail || 'Login failed. Please check username or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (regPassword !== regConfirmPassword) {
      setError('Mật khẩu xác nhận không trùng khớp.');
      return;
    }

    if (regPassword.length < 6) {
      setError('Mật khẩu phải có độ dài ít nhất 6 ký tự.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/register', {
        username: regUsername.trim(),
        password: regPassword,
        role: 'viewer'
      });

      setSuccessMsg(`Tài khoản Viewer "${regUsername}" đã được tạo thành công! Bạn có thể đăng nhập ngay.`);
      setUsername(regUsername);
      setPassword(regPassword);
      setRegUsername('');
      setRegPassword('');
      setRegConfirmPassword('');
      setMode('login');
    } catch (err: any) {
      if (!err.response) {
        setError(`Cannot connect to Jetson API (${api.defaults.baseURL}). Please check if Backend is running.`);
      } else {
        setError(err.response.data?.detail || 'Đăng ký tài khoản thất bại. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (newPassword !== confirmNewPassword) {
      setError('Mật khẩu xác nhận không trùng khớp.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/reset-password', {
        username: resetUsername.trim(),
        recovery_code: recoveryCode.trim(),
        new_password: newPassword
      });

      setSuccessMsg(response.data?.message || 'Đặt lại mật khẩu thành công! Hãy đăng nhập với mật khẩu mới.');
      setUsername(resetUsername);
      setPassword(newPassword);
      setResetUsername('');
      setRecoveryCode('');
      setNewPassword('');
      setConfirmNewPassword('');
      setMode('login');
    } catch (err: any) {
      if (!err.response) {
        setError(`Cannot connect to Jetson API (${api.defaults.baseURL}). Please check if Backend is running.`);
      } else {
        setError(err.response.data?.detail || 'Khôi phục mật khẩu thất bại. Vui lòng kiểm tra mã bảo mật.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '36px' }}>
        {/* Header Icon & Title */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            background: mode === 'register' 
              ? 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)'
              : mode === 'forgot'
              ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
              : 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '12px',
            boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)'
          }}>
            {mode === 'register' ? (
              <UserPlus size={28} color="white" />
            ) : mode === 'forgot' ? (
              <KeyRound size={28} color="white" />
            ) : (
              <ShieldAlert size={30} color="white" />
            )}
          </div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 700 }}>
            {mode === 'register'
              ? 'Đăng Ký Tài Khoản'
              : mode === 'forgot'
              ? 'Khôi Phục Mật Khẩu'
              : 'Open-Set Face Recognition'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
            {mode === 'register'
              ? 'Tạo tài khoản quản trị/vận hành hệ thống'
              : mode === 'forgot'
              ? 'Nhập mã Master Key để thiết lập mật khẩu mới'
              : 'NVIDIA Jetson Orin Nano Edge Dashboard'}
          </p>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: 'var(--accent-rose)',
            fontSize: '0.85rem',
            marginBottom: '18px',
            lineHeight: 1.4
          }}>
            {error}
          </div>
        )}

        {/* Success Alert Box */}
        {successMsg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#10b981',
            fontSize: '0.85rem',
            marginBottom: '18px',
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle2 size={16} />
            {successMsg}
          </div>
        )}

        {/* 1. LOGIN MODE */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} autoComplete="off">
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <UserIcon size={18} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <input
                  type="text"
                  placeholder="Nhập tên đăng nhập"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <input
                  type="password"
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
            </div>

            {/* Forgot Password Link */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '18px' }}>
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(''); setSuccessMsg(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-cyan)',
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                Quên mật khẩu?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glass-button"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              {loading ? 'Authenticating...' : 'Sign In to Dashboard'}
            </button>

            {/* Switch to Register */}
            <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Chưa có tài khoản?{' '}
              <button
                type="button"
                onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#818cf8',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Đăng ký ngay
              </button>
            </div>
          </form>
        )}

        {/* 2. REGISTER MODE */}
        {mode === 'register' && (
          <form onSubmit={handleRegister}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Tên đăng nhập (Username)
              </label>
              <div style={{ position: 'relative' }}>
                <UserIcon size={18} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <input
                  type="text"
                  placeholder="Ví dụ: operator_1"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
            </div>

            <div style={{
              marginBottom: '14px',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              fontSize: '0.82rem',
              color: '#c7d2fe',
              lineHeight: 1.45
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#818cf8', marginBottom: '4px' }}>
                <ShieldAlert size={15} /> Vai trò mặc định: Viewer (Chỉ xem)
              </div>
              Tài khoản tự đăng ký ngoại vi chỉ được cấp quyền Viewer. Để cấp quyền Vận hành (Operator) hoặc Quản trị (Admin), cần do Quản trị viên (Admin) tạo từ bên trong Dashboard.
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Mật khẩu (Tối thiểu 6 ký tự)
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Xác nhận mật khẩu
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glass-button"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '12px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white'
              }}
            >
              {loading ? 'Đang tạo tài khoản...' : 'Tạo Tài Khoản Mới'}
            </button>

            {/* Back to Login */}
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <ArrowLeft size={15} /> Đã có tài khoản? Đăng nhập ngay
              </button>
            </div>
          </form>
        )}

        {/* 3. FORGOT PASSWORD MODE */}
        {mode === 'forgot' && (
          <form onSubmit={handleResetPassword}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Tài khoản cần khôi phục (Username)
              </label>
              <div style={{ position: 'relative' }}>
                <UserIcon size={18} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <input
                  type="text"
                  placeholder="Ví dụ: admin"
                  value={resetUsername}
                  onChange={(e) => setResetUsername(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Mã bảo mật hệ thống (Master Recovery Key)
              </label>
              <div style={{ position: 'relative' }}>
                <KeyRound size={18} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <input
                  type="password"
                  placeholder="Nhập mã bảo mật (Master Key)"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Mật khẩu mới
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Xác nhận mật khẩu mới
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glass-button"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '12px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: 'white'
              }}
            >
              {loading ? 'Đang cập nhật mật khẩu...' : 'Đặt Lại Mật Khẩu'}
            </button>

            {/* Back to Login */}
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <ArrowLeft size={15} /> Quay lại Đăng nhập
              </button>
            </div>
          </form>
        )}

        {/* Jetson Server IP settings toggle */}
        <div style={{ marginTop: '22px', borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
          <button
            type="button"
            onClick={() => setShowIpConfig(!showIpConfig)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-cyan)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 0'
            }}
          >
            <Settings size={14} /> {showIpConfig ? 'Ẩn cấu hình Server IP' : `Server IP: ${serverIp}`}
          </button>

          {showIpConfig && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={serverIp}
                onChange={(e) => setServerIp(e.target.value)}
                placeholder="e.g. 10.39.4.131:8000"
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--border-glass)',
                  color: 'white',
                  fontSize: '0.85rem'
                }}
              />
              <button
                type="button"
                onClick={handleSaveIp}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                Lưu
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
