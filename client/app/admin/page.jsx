"use client";
import { useState } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import GetUserCount from "@/components/GetUserCount";

export default function AdminDashboardPage() {
  const [userCount, setUserCount] = useState(0);

  console.log(userCount);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-1">Admin Dashboard</h1>
      <div>
        <GetUserCount setUserCount={setUserCount} />
      </div>
    </div>

    // <div>
    //   <p className="text-gray-500 mb-8">Logged in as {session.user.email}</p>
    //   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    //     {[
    //       { label: "Total Users", value: userCount },
    //       { label: "Active Subscriptions", value: "—" },
    //       { label: "Published Videos", value: "—" },
    //     ].map((stat) => (
    //       <div key={stat.label} className="bg-white border rounded-lg p-6">
    //         <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
    //           {stat.label}
    //         </p>
    //         <p className="text-4xl font-bold mt-2">{stat.value}</p>
    //       </div>
    //     ))}
    //   </div>
    // </div>
  );
}
