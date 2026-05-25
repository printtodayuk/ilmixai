import { useState, useEffect } from 'react';
import SupportEngineerPanel from './SupportEngineerPanel';
import { collection, query, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { PendingUser, User } from '../types';
import { useAuth } from '../App';
import { Mail, Plus, Shield } from 'lucide-react';

export default function AltAdminPanel({ view = 'tickets' }: { view?: 'tickets' | 'users' }) {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'alt_admin' | 'support_engineer' | 'end_user'>('end_user');
  const [newEmpId, setNewEmpId] = useState('');

  useEffect(() => {
    if (view !== 'users') return;
    const q = query(collection(db, 'pending_users'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map(d => d.data() as PendingUser));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'pending_users');
    });
    return () => unsubscribe();
  }, [view]);

  const handleAddUser = async () => {
    if (!newEmail || !newEmpId || !userProfile) return;
    try {
      await setDoc(doc(db, 'pending_users', newEmail.toLowerCase()), {
        email: newEmail.toLowerCase(),
        role: newRole,
        employeeId: newEmpId,
        createdBy: userProfile.userId,
        createdAt: new Date().toISOString()
      });
      setShowAdd(false);
      setNewEmail('');
      setNewEmpId('');
      setNewRole('end_user');
    } catch(e) {
      handleFirestoreError(e, OperationType.CREATE, `pending_users/${newEmail}`);
    }
  };

  if (view === 'tickets') {
    return <SupportEngineerPanel />;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">User Management</h2>
          <p className="text-slate-400 mt-1">Add or authorize users to the platform.</p>
        </div>
        
        <button 
          onClick={() => setShowAdd(true)}
          className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-400 text-white px-5 py-2.5 rounded-full shadow-xl transition-all text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>Add User Auth</span>
        </button>
      </div>

      <div className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 overflow-hidden">
         <table className="w-full text-left text-sm text-slate-400">
           <thead className="bg-black/20 border-b border-white/10 text-slate-300">
             <tr>
               <th className="px-6 py-4 font-semibold">Email</th>
               <th className="px-6 py-4 font-semibold">Employee ID</th>
               <th className="px-6 py-4 font-semibold">Authorized Role</th>
               <th className="px-6 py-4 font-semibold">Created At</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-white/5">
              {users.map(u => (
                <tr key={u.email} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 font-medium text-white flex items-center">
                    <Mail className="w-4 h-4 mr-3 opacity-50" />
                    {u.email}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">{u.employeeId}</td>
                  <td className="px-6 py-4 uppercase text-[10px] tracking-wider font-bold">
                     <span className={`px-2.5 py-1 rounded-full border ${u.role !== 'end_user' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-slate-500/20 text-slate-300 border-slate-500/30'}`}>
                        {u.role.replace('_', ' ')}
                     </span>
                  </td>
                  <td className="px-6 py-4 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No pending or authorized users found.</td></tr>
              )}
           </tbody>
         </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-8">
              <h3 className="text-lg font-bold text-white mb-2">Authorize New User</h3>
              <p className="text-xs text-slate-400 mb-6 font-medium tracking-wide">Users must log in with this Google email to claim the account.</p>
              <div className="space-y-4">
                 <div>
                    <label className="block text-[11px] font-medium text-slate-400 uppercase mb-1.5">Email <span className="text-blue-400">*</span></label>
                    <input 
                      type="email" 
                      value={newEmail} onChange={e => setNewEmail(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-slate-500"
                    />
                 </div>
                 <div>
                    <label className="block text-[11px] font-medium text-slate-400 uppercase mb-1.5">Employee ID <span className="text-blue-400">*</span></label>
                    <input 
                      type="text" 
                      value={newEmpId} onChange={e => setNewEmpId(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-slate-500"
                    />
                 </div>
                 <div>
                    <label className="block text-[11px] font-medium text-slate-400 uppercase mb-1.5">Role</label>
                    <select 
                      value={newRole} onChange={(e: any) => setNewRole(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-slate-500 [&>option]:text-black"
                    >
                      <option value="end_user">End User</option>
                      <option value="support_engineer">Support Engineer</option>
                      {userProfile?.role === 'super_admin' && <option value="alt_admin">Alt Admin</option>}
                    </select>
                 </div>
                 <div className="pt-4 flex justify-end space-x-3">
                    <button onClick={() => setShowAdd(false)} className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:text-white rounded-xl transition-colors">Cancel</button>
                    <button 
                      onClick={handleAddUser} 
                      disabled={!newEmail || !newEmpId}
                      className="px-5 py-2.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-400 shadow-xl rounded-xl transition-all disabled:opacity-50"
                    >
                      Authorize
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
