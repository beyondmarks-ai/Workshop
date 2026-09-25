"use client";

import { useEffect, useState } from "react";

export default function ActivityPage() {
  const [activities, setActivities] = useState(null);
  const [database, setDatabase] = useState(null);
  const [expanded, setExpanded] = useState(null);
  useEffect(() => { fetch("/api/activity").then((response) => response.ok ? response.json() : Promise.reject()).then((data) => { setDatabase(data); setActivities(data.activities); }).catch(() => setActivities([])); }, []);
  return <main className="resources-shell"><header><div><small>COSMOS DB DATA EXPLORER</small><h1>My Activity</h1><p>Only your partitioned records are visible here.</p></div><a href="/dashboard">Dashboard</a></header>{database && <section className="db-meta"><article><small>DATABASE</small><strong>{database.database}</strong></article><article><small>CONTAINER</small><strong>{database.container}</strong></article><article><small>PARTITION</small><strong>{database.partitionKey}</strong></article><article><small>DOCUMENTS</small><strong>{activities?.length || 0}</strong></article></section>}<section className="resource-list">{activities === null ? <p>Loading activity…</p> : activities.length ? activities.map((activity) => <article className="db-document" key={activity.id}><div><strong>{activity.service}</strong><span>{new Date(activity.createdAt).toLocaleString()} · {activity.status} · -{activity.creditsUsed} credit</span></div><button type="button" onClick={() => setExpanded(expanded === activity.id ? null : activity.id)}>{expanded === activity.id ? "Hide document" : "View document"}</button>{expanded === activity.id && <pre>{JSON.stringify(activity, null, 2)}</pre>}</article>) : <p>No activity recorded yet. Your first API call will appear here.</p>}</section></main>;
}
