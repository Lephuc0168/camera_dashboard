import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { LayoutDashboard, Sliders, History, Users, Camera, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();

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

  const [username, setUsername] = useState(localStorage.getItem('username') || 'Operator');
  const [userRole, setUserRole] = useState(getInitialRole);

  useEffect(() => {
    api.get('/auth/me').then(res => {
      if (res.data) {
        if (res.data.role) {
          setUserRole(res.data.role);
          localStorage.setItem('user_role', res.data.role);
        }
        if (res.data.username) {
          setUsername(res.data.username);
          localStorage.setItem('username', res.data.username);
        }
      }
    }).catch(() => {
      if ((localStorage.getItem('username') || '').toLowerCase() === 'admin') {
        setUserRole('admin');
        localStorage.setItem('user_role', 'admin');
      }
    });
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('username');
    localStorage.removeItem('user_role');
    navigate('/login');
  };

  return (
    <aside style={{
      width: '260px',
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      background: 'rgba(11, 15, 25, 0.85)',
      backdropFilter: 'blur(20px)',
      borderRight: '1px solid var(--border-glass)',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 16px',
      zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '36px', paddingLeft: '8px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)'
        }}>
          <ShieldAlert size={22} color="white" />
        </div>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>Open-Set FR</h2>
          <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>Jetson Orin Nano</span>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        <NavLink to="/dashboard" style={({ isActive }) => navLinkStyle(isActive)}>
          <LayoutDashboard size={18} /> Dashboard
        </NavLink>
        <NavLink to="/thresholds" style={({ isActive }) => navLinkStyle(isActive)}>
          <Sliders size={18} /> EVT Thresholds
        </NavLink>
        <NavLink to="/events" style={({ isActive }) => navLinkStyle(isActive)}>
          <History size={18} /> Recognition Events
        </NavLink>
        <NavLink to="/persons" style={({ isActive }) => navLinkStyle(isActive)}>
          <Users size={18} /> Enrolled Persons
        </NavLink>
        {userRole === 'admin' && (
          <NavLink to="/users" style={({ isActive }) => navLinkStyle(isActive)}>
            <ShieldCheck size={18} /> User Management
          </NavLink>
        )}
      </nav>

      <div style={{
        padding: '16px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-glass)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>{username}</span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: '4px',
              textTransform: 'uppercase',
              color: userRole === 'admin' ? '#a855f7' : userRole === 'operator' ? '#06b6d4' : '#94a3b8',
              background: userRole === 'admin' ? 'rgba(168, 85, 247, 0.2)' : userRole === 'operator' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(148, 163, 184, 0.2)',
              border: `1px solid ${userRole === 'admin' ? '#a855f7' : userRole === 'operator' ? '#06b6d4' : '#94a3b8'}40`
            }}>
              {userRole}
            </span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px' }}>Active Session</div>
        </div>
        <button onClick={handleLogout} style={{
          background: 'none',
          border: 'none',
          color: 'var(--accent-rose)',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: '6px'
        }} title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
};

const navLinkStyle = (isActive: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 16px',
  borderRadius: 'var(--radius-md)',
  textDecoration: 'none',
  fontSize: '0.92rem',
  fontWeight: 500,
  color: isActive ? 'white' : 'var(--text-muted)',
  background: isActive ? 'linear-gradient(90deg, rgba(99, 102, 241, 0.25) 0%, transparent 100%)' : 'transparent',
  borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
  transition: 'all 0.2s ease'
});
