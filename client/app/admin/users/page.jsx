'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-700',
  trialing: 'bg-blue-100 text-blue-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-gray-100 text-gray-500',
  none: 'bg-gray-100 text-gray-500',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [access, setAccess] = useState({});

  const load = useCallback(async (term = '') => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/v1/admin/users', {
        params: term ? { search: term } : {},
      });
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    api
      .get('/api/v1/courses/admin/all')
      .then(({ data }) => setCourses(data))
      .catch(() => {});
  }, [load]);

  const changeRole = async (user, role) => {
    if (
      role === 'user' &&
      !confirm(`Remove admin access from ${user.email}? They will lose the admin panel.`)
    ) {
      return;
    }

    setError('');
    try {
      await api.patch(`/api/v1/admin/users/${user.id}/role`, { role });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role } : u)));
    } catch (err) {
      setError(err.message);
    }
  };

  const openAccess = async (user) => {
    if (expanded === user.id) {
      setExpanded(null);
      return;
    }
    setExpanded(user.id);

    try {
      const { data } = await api.get(`/api/v1/admin/users/${user.id}/access`);
      setAccess((prev) => ({ ...prev, [user.id]: data }));
    } catch (err) {
      setError(err.message);
    }
  };

  const grant = async (userId, courseId) => {
    if (!courseId) return;
    try {
      await api.post(`/api/v1/admin/users/${userId}/grant-course`, { courseId });
      const { data } = await api.get(`/api/v1/admin/users/${userId}/access`);
      setAccess((prev) => ({ ...prev, [userId]: data }));
    } catch (err) {
      setError(err.message);
    }
  };

  const revoke = async (userId, courseId) => {
    try {
      await api.delete(`/api/v1/admin/users/${userId}/grant-course/${courseId}`);
      setAccess((prev) => ({
        ...prev,
        [userId]: (prev[userId] ?? []).filter((a) => a.courseId !== courseId),
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Members</h1>
      <p className="text-gray-500 mb-6">
        Everyone with an account, what they&apos;re paying for, and what they can watch.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(search);
        }}
        className="flex gap-2 mb-6"
      >
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email…"
          className="border rounded px-3 py-2 text-sm w-full max-w-xs"
        />
        <button type="submit" className="px-4 py-2 border rounded text-sm hover:bg-gray-100">
          Search
        </button>
      </form>

      {error && (
        <p className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Member</th>
                <th className="px-4 py-3 font-semibold">Membership</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold text-right">Course access</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <Fragment key={user.id}>
                  <tr className="border-t">
                    <td className="px-4 py-3">
                      <p className="font-medium">{user.fullName || '—'}</p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          STATUS_STYLES[user.subscriptionStatus] ?? STATUS_STYLES.none
                        }`}
                      >
                        {user.subscriptionStatus === 'none'
                          ? 'No plan'
                          : user.subscriptionStatus.replace('_', ' ')}
                      </span>
                      {user.tierName && (
                        <p className="text-xs text-gray-400 mt-1">{user.tierName}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        onChange={(e) => changeRole(user, e.target.value)}
                        className="border rounded px-2 py-1 text-xs"
                      >
                        <option value="user">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openAccess(user)}
                        className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                      >
                        {expanded === user.id ? 'Close' : 'Manage'}
                      </button>
                    </td>
                  </tr>

                  {expanded === user.id && (
                    <tr className="border-t bg-gray-50">
                      <td colSpan={4} className="px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                          Courses this member owns
                        </p>

                        {(access[user.id] ?? []).length === 0 ? (
                          <p className="text-sm text-gray-400 mb-3">
                            None bought outright. They may still have access through a membership
                            plan.
                          </p>
                        ) : (
                          <ul className="space-y-1 mb-3">
                            {(access[user.id] ?? []).map((entry) => (
                              <li key={entry.courseId} className="flex items-center gap-2 text-sm">
                                <span>{entry.title}</span>
                                <span className="text-xs text-gray-400">({entry.source})</span>
                                <button
                                  type="button"
                                  onClick={() => revoke(user.id, entry.courseId)}
                                  className="text-xs text-red-600 hover:underline"
                                >
                                  remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        <select
                          defaultValue=""
                          onChange={(e) => {
                            grant(user.id, e.target.value);
                            e.target.value = '';
                          }}
                          className="border rounded px-2 py-1 text-sm"
                        >
                          <option value="">Give access to a course…</option>
                          {courses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.title}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <p className="p-8 text-center text-gray-400">No members yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
