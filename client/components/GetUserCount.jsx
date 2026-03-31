"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

export default function GetUserCount() {
  const { data: session } = useSession();
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roleError, setRoleError] = useState("");

  const fetchUsers = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/users`,
        {
          headers: { Authorization: `Bearer ${session.user.accessToken}` },
        },
      );
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUserCount(data.length);
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <>
      <div key="label" className="bg-white border rounded-lg p-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Users
        </p>
        <p className="text-4xl font-bold mt-2">{userCount}</p>
      </div>
    </>
  );
}
