import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hasSeenOnboarding } from '../lib/appFlow';
import { supabase } from '../supabaseClient';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    const {
      data: { session },
      error: signUpError,
    } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (session) {
      navigate(hasSeenOnboarding() ? '/display-name' : '/onboarding', { replace: true });
      return;
    }

    navigate(hasSeenOnboarding() ? '/login' : '/onboarding', { replace: true });
  };

  return (
    <div className="mobile-shell">
      <div className="app-screen auth-screen">
        <div className="container auth-container">
          <div className="auth-copy">
            <p className="section-eyebrow">회원가입</p>
            <h1>새 계정을 만들고 루틴을 시작해요</h1>
            <p>가입을 마치면 표시 이름만 설정하고 바로 홈으로 들어갈 수 있어요.</p>
          </div>

          <form onSubmit={handleSignUp}>
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
              {loading ? '가입 중...' : '가입하기'}
            </button>
          </form>

          <Link className="auth-link" to="/login">
            로그인으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
