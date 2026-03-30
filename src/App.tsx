import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Battle from './pages/Battle';
import CreateRoutine from './pages/CreateRoutine';
import Feed from './pages/Feed';
import Friends from './pages/Friends';
import Home from './pages/Home';
import Login from './pages/Login';
import MyPage from './pages/MyPage';
import Onboarding from './pages/Onboarding';
import SignUp from './pages/SignUp';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        }
      />
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
        path="/feed"
        element={
          <ProtectedRoute>
            <Feed />
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
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
