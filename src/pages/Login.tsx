import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hasSeenOnboarding } from '../lib/appFlow';
import { supabase } from '../supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    navigate(hasSeenOnboarding() ? '/home' : '/onboarding', { replace: true });
  };

  return (
    <div className="mobile-shell">
      <div className="app-screen auth-screen">
        <div className="container auth-container">
          <div className="auth-copy">
            <p className="section-eyebrow">로그인</p>
            <h1>다시 루틴 배틀에 들어갈게요</h1>
            <p>이메일과 비밀번호를 입력하면 바로 이어서 시작할 수 있어요.</p>
          </div>

          <form onSubmit={handleLogin}>
            <input
              required
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <input
              required
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          <Link className="auth-link" to="/signup">
            회원가입
          </Link>
        </div>
      </div>
    </div>
  );
}
