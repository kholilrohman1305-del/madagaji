import { useAuth } from '../context/AuthContext';
import { UserCircle } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="modern-table-card">
      <div className="modern-table-title"><UserCircle size={24} /> Profile</div>
      <div className="profile-grid">
        <div>
          <div className="profile-label">Nama</div>
          <div className="profile-value">{user.display_name || '-'}</div>
        </div>
        <div>
          <div className="profile-label">Username</div>
          <div className="profile-value">{user.username}</div>
        </div>
        <div>
          <div className="profile-label">Role</div>
          <div className="profile-value">{user.role}</div>
        </div>
      </div>
    </div>
  );
}
