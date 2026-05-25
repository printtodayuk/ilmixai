import { useAuth } from '../App';
import { logout } from '../firebase';
import { LogOut, LayoutDashboard, Ticket, Users, Settings } from 'lucide-react';
import { Routes, Route, Link, useLocation } from 'react-router';
import SuperAdminPanel from './SuperAdminPanel';
import AltAdminPanel from './AltAdminPanel';
import SupportEngineerPanel from './SupportEngineerPanel';
import EndUserPanel from './EndUserPanel';
import TicketDetail from './TicketDetail';

export default function Dashboard() {
  const { userProfile } = useAuth();
  const location = useLocation();

  if (!userProfile) return null;

  return (
    <div className="min-h-screen flex flex-col md:flex-row relative z-10 w-full bg-transparent">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white/5 backdrop-blur-xl border-r border-white/10 flex flex-col z-20 flex-shrink-0">
        <div className="p-6 border-b border-white/10 flex flex-col justify-center">
          <h1 className="text-xl font-bold tracking-tight text-white">ilmix <span className="text-blue-400">AI</span></h1>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-1">by Remotized IT</p>
        </div>
        
        <nav className="flex-1 p-4 flex flex-col space-y-2">
          <Link 
            to="/dashboard" 
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${location.pathname === '/dashboard' ? 'bg-white/10 border border-white/10 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            <LayoutDashboard className="w-5 h-5 opacity-80" />
            <span>Dashboard</span>
          </Link>

          {(userProfile.role === 'super_admin' || userProfile.role === 'alt_admin') && (
            <Link 
              to="/dashboard/users" 
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${location.pathname.includes('/users') ? 'bg-white/10 border border-white/10 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <Users className="w-5 h-5 opacity-80" />
              <span>Users</span>
            </Link>
          )}

          {userProfile.role === 'super_admin' && (
            <Link 
              to="/dashboard/settings" 
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${location.pathname.includes('/settings') ? 'bg-white/10 border border-white/10 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <Settings className="w-5 h-5 opacity-80" />
              <span>Settings</span>
            </Link>
          )}
        </nav>

        <div className="p-4 mt-auto">
           <div className="flex items-center justify-between bg-gradient-to-br from-blue-500/20 to-purple-500/20 p-4 rounded-2xl border border-white/10 backdrop-blur-lg">
             <div className="flex flex-col truncate">
                <span className="text-[10px] uppercase text-slate-400">Current Session</span>
                <span className="text-sm font-semibold text-white truncate">{userProfile.name}</span>
             </div>
             <button onClick={logout} className="p-2 text-slate-400 hover:text-white transition-colors" title="Logout">
                <LogOut className="w-4 h-4" />
             </button>
           </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col h-[100dvh]">
        <Routes>
          <Route path="/" element={
            userProfile.role === 'super_admin' ? <SuperAdminPanel /> :
            userProfile.role === 'alt_admin' ? <AltAdminPanel /> :
            userProfile.role === 'support_engineer' ? <SupportEngineerPanel /> :
            <EndUserPanel />
          } />
          
          <Route path="/ticket/:ticketId" element={<TicketDetail />} />
          
          {userProfile.role === 'super_admin' && (
            <>
              <Route path="/settings" element={<SuperAdminPanel view="settings" />} />
              <Route path="/users" element={<SuperAdminPanel view="users" />} />
            </>
          )}

          {userProfile.role === 'alt_admin' && (
            <Route path="/users" element={<AltAdminPanel view="users" />} />
          )}

        </Routes>
      </main>
    </div>
  );
}
