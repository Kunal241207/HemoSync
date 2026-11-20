import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../services/api';
import heartbeatDropLogo from '../../assets/Heartbeat Drop Logo.png';
import {
  Lock,
  Mail,
  User,
  Building,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  ChevronDown
} from 'lucide-react';

export function LoginPage() {
  const authViewportRef = useRef(null);
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('HOSPITAL_STAFF');
  const [institutionId, setInstitutionId] = useState('');
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  useLayoutEffect(() => {
    if (authViewportRef.current) authViewportRef.current.scrollTop = 0;
  }, [isRegister]);

  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  useEffect(() => {
    if (isRegister) {
      apiClient.getInstitutions({ limit: 50 })
        .then((res) => {
          const list = res?.data?.institutions || [];
          setInstitutions(list);
          if (list.length > 0 && !institutionId) {
            setInstitutionId(list[0].id);
          }
        })
        .catch(() => {});
    }
  }, [isRegister]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setLoading(true);

    try {
      if (isRegister) {
        await register({
          name,
          email,
          password,
          role,
          institutionId: role === 'PLATFORM_ADMIN' ? undefined : institutionId
        });
        setIsRegister(false);
        setPassword('');
        setSuccessMessage('Account created. Sign in with your new credentials to continue.');
      } else {
        await login(email, password);
        navigate(from, { replace: true });
      }
    } catch (err) {
      setErrorMessage(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-viewport" ref={authViewportRef}>
      <div className="auth-container">
        <div className="auth-brand-pane">
          <div className="auth-brand-header">
            <img className="auth-logo-mark" src={heartbeatDropLogo} alt="HemoSync" />
            <div className="auth-brand-copy">
              <div className="auth-brand-name"><span>Hemo</span><span>Sync</span></div>
            </div>
          </div>

          <div className="auth-pitch">
            <h2>Smarter Operations.<br /><strong>Better Patient Care.</strong></h2>
          </div>
        </div>

        <div className="auth-form-pane">
          <div className="auth-form-card">
            <div className="auth-tab-switch">
              <span className={`auth-tab-indicator ${isRegister ? 'is-register' : ''}`} />
              <button
                type="button"
                className={`auth-tab ${!isRegister ? 'active' : ''}`}
                onClick={() => { setIsRegister(false); setErrorMessage(''); setSuccessMessage(''); }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`auth-tab ${isRegister ? 'active' : ''}`}
                onClick={() => { setIsRegister(true); setErrorMessage(''); setSuccessMessage(''); }}
              >
                Create Account
              </button>
            </div>

            <div className={`auth-copy ${isRegister ? 'is-register' : ''}`} key={isRegister ? 'register-copy' : 'login-copy'}>
              <p>
                {isRegister
                  ? 'Set up your access to the HemoSync workspace.'
                  : 'Sign in to continue to your workspace.'}
              </p>
            </div>

            {errorMessage && (
              <div className="auth-error-banner">
                <AlertCircle size={16} />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && <div className="auth-success-banner">{successMessage}</div>}

            <form onSubmit={handleSubmit} className={`auth-form ${isRegister ? 'is-register' : ''}`} key={isRegister ? 'register-form' : 'login-form'}>
              {isRegister && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="reg-name">Full Name</label>
                  <div className="input-with-icon">
                    <User size={16} className="input-icon" />
                    <input
                      id="reg-name"
                      type="text"
                      className="form-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>
              )}

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="auth-email">Work Email Address</label>
                <div className="input-with-icon">
                  <Mail size={16} className="input-icon" />
                  <input
                    id="auth-email"
                    type="email"
                    className="form-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@hospital.org"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="auth-password">Password</label>
                <div className="input-with-icon">
                  <Lock size={16} className="input-icon" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((visible) => !visible)}
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </div>

              {isRegister && (
                <>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" htmlFor="reg-role">Role</label>
                    <div className="auth-select-wrap">
                      <select
                        id="reg-role"
                        className="form-input auth-select"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        disabled={loading}
                      >
                        <option value="HOSPITAL_STAFF">Hospital Staff (Requests & Matching)</option>
                        <option value="BLOOD_BANK_STAFF">Blood Bank Staff (Inventory & Allocation)</option>
                        <option value="PLATFORM_ADMIN">Platform Administrator</option>
                      </select>
                      <ChevronDown className="auth-select-chevron" size={18} aria-hidden="true" />
                    </div>
                  </div>

                  {role !== 'PLATFORM_ADMIN' && (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" htmlFor="reg-inst">Institution</label>
                      <div className="input-with-icon auth-select-wrap">
                        <Building size={16} className="input-icon" />
                        <select
                          id="reg-inst"
                          className="form-input auth-select"
                          value={institutionId}
                          onChange={(e) => setInstitutionId(e.target.value)}
                          required
                          disabled={loading}
                        >
                          <option value="" disabled>
                            {institutions.length ? 'Select an institution' : 'No institutions available'}
                          </option>
                          {institutions.map((inst) => (
                            <option key={inst.id} value={inst.id}>
                              {inst.name} ({inst.type === 'HOSPITAL' ? 'Hospital' : 'Blood Bank'})
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="auth-select-chevron" size={18} aria-hidden="true" />
                      </div>
                    </div>
                  )}
                </>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                <span>{loading ? (isRegister ? 'Creating account...' : 'Signing in...') : (isRegister ? 'Create Account' : 'Sign In to Dashboard')}</span>
                <ArrowRight size={16} />
              </button>
            </form>

          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
