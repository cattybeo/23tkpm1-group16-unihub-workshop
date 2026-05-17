import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { setAuth } from '@/lib/auth-store';
import { Loader2, Lock } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (data.session) {
        setAuth(data.user, data.session.access_token); 
        
        console.log("Đăng nhập thành công, chuẩn bị chuyển trang...");
        
        navigate('/admin'); 
      }
    } catch (err: any) {
      alert('Lỗi đăng nhập: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F2F2F7] p-6">
      <form onSubmit={handleLogin} className="w-full max-w-md bg-white rounded-[32px] p-8 shadow-sm border border-gray-100">
        <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 mx-auto text-blue-600">
          <Lock size={32} />
        </div>
        <h1 className="text-2xl font-bold text-center mb-8">UniHub Login</h1>
        
        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email (Admin/SV)"
            className="w-full h-14 px-4 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:border-blue-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Mật khẩu"
            className="w-full h-14 px-4 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:border-blue-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            disabled={loading}
            className="w-full h-14 bg-black text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Đăng nhập'}
          </button>
        </div>
        <p className="text-center text-sm text-gray-400 mt-6">
          Dùng tài khoản trong seed.sql để test (VD: organizer1@unihub.edu)
        </p>
      </form>
    </div>
  );
}