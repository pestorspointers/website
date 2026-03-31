'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-700',
  past_due: 'bg-yellow-100 text-yellow-700',
  canceled: 'bg-red-100 text-red-600',
};

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roleError, setRoleError] = useState('');

  const fetchUsers = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/users`,
        {
          headers: { Authorization: `Bearer ${session.user.accessToken}` },
        }
      );
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers(data);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const adminCount = users.filter((u) => u.role === 'admin').length;

  const updateRole = async (userId, newRole) => {
    setRoleError('');
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/users/${userId}/role`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.user.accessToken}`,
        },
        body: JSON.stringify({ role: newRole }),
      }
    );
    if (!res.ok) {
      const data = await res.json();
      setRoleError(data.error || 'Failed to update role');
      return;
    }
    fetchUsers();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Users</h1>
        <span className="text-sm text-gray-400">{users.length} total</span>
      </div>

      {error && (
        <p className="text-red-600 text-sm mb-4 p-2 bg-red-50 rounded">{error}</p>
      )}
      {roleError && (
        <p className="text-red-600 text-sm mb-4 p-2 bg-red-50 rounded">{roleError}</p>
      )}

      {loading ? (
        <div className="bg-white border rounded-lg p-10 text-center text-gray-400 text-sm">
          Loading users…
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white border rounded-lg p-10 text-center text-gray-400 text-sm">
          No users found.
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stripe ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Videos</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Subscriptions</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Sub Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => {
                const subStatus = user.subscription?.status;
                const hasSub = subStatus && subStatus !== 'none';
                return (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{user.email}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {user.stripeCustomerId || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {user.role === 'admin' && adminCount <= 1 ? (
                        <span
                          title="At least one admin must remain"
                          className="text-xs border rounded px-2 py-1 bg-gray-50 text-gray-400 cursor-not-allowed inline-block"
                        >
                          admin
                        </span>
                      ) : (
                        <select
                          value={user.role}
                          onChange={(e) => updateRole(user._id, e.target.value)}
                          className="text-xs border rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-black"
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {user.purchasedVideoIds?.length ?? 0}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {hasSub ? 1 : 0}
                    </td>
                    <td className="px-4 py-3">
                      {hasSub ? (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            STATUS_STYLES[subStatus] ?? 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {subStatus}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
