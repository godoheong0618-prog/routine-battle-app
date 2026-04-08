import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AuthCallback from './pages/AuthCallback';
import Battle from './pages/Battle';
import CreateRoutine from './pages/CreateRoutine';
import DisplayName from './pages/DisplayName';
import Entry from './pages/Entry';
import Focus from './pages/Focus';
import Friends from './pages/Friends';
import Home from './pages/Home';
import Login from './pages/Login';
import MyPage from './pages/MyPage';
import Onboarding from './pages/Onboarding';
import SignUp from './pages/SignUp';
import Stats from './pages/Stats';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Entry />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/display-name" element={<DisplayName />} />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/friends"
        element={
          <ProtectedRoute>
            <Friends />
          </ProtectedRoute>
        }
      />
      <Route
        path="/battle"
        element={
          <ProtectedRoute>
            <Battle />
          </ProtectedRoute>
        }
      />
      <Route path="/feed" element={<Navigate to="/battle" replace />} />
      <Route
        path="/focus"
        element={
          <ProtectedRoute>
            <Focus />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stats"
        element={
          <ProtectedRoute>
            <Stats />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mypage"
        element={
          <ProtectedRoute>
            <MyPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/create-routine"
        element={
          <ProtectedRoute>
            <CreateRoutine />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
